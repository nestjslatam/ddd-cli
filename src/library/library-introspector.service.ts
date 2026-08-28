import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { Injectable } from '@nestjs/common';
import * as ts from 'typescript';

import {
  MemberInfo,
  StereotypeFamily,
  StereotypeRole,
  StereotypeSymbol,
} from './stereotype.model';

const PACKAGE = '@nestjslatam/ddd-lib';

/** Matches `typeof Target`, the shape TypeScript emits for a class alias. */
const ALIAS_PATTERN = /^typeof\s+(\w+)$/;

/** Levenshtein distance, used only to rank "did you mean" candidates. */
function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const carried = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = carried;
    }
  }

  return previous[b.length];
}

/**
 * Reads the installed library's type declarations.
 *
 * Everything the CLI says about the library comes from here, parsed with the
 * TypeScript compiler rather than pattern-matched. That is the point: an
 * explanation anchored to the declarations that are actually installed cannot
 * describe an API that does not exist, and it stays correct across library
 * versions without the CLI being updated.
 */
@Injectable()
export class LibraryIntrospectorService {
  private cache: StereotypeSymbol[] | null = null;

  /** Locates the installed package, searching the project then the CLI itself. */
  resolveLibraryRoot(from: string = process.cwd()): string {
    const candidates = [from, __dirname];

    for (const start of candidates) {
      try {
        const manifest = require.resolve(`${PACKAGE}/package.json`, {
          paths: [start],
        });
        return dirname(manifest);
      } catch {
        // Try the next candidate.
      }
    }

    throw new Error(
      `Could not find ${PACKAGE}. Install it in this project, or run the CLI ` +
        'from a project that depends on it.',
    );
  }

  /** Every exported symbol, with its declaration metadata. */
  read(from?: string): StereotypeSymbol[] {
    if (this.cache) {
      return this.cache;
    }

    const root = this.resolveLibraryRoot(from);
    const files = this.declarationFiles(root);
    const symbols: StereotypeSymbol[] = [];

    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.ES2022,
        true,
      );

      for (const statement of source.statements) {
        const symbol = this.readStatement(
          statement,
          source,
          relative(root, file),
        );
        if (symbol) {
          symbols.push(symbol);
        }
      }
    }

    // An alias should describe itself the way its target does.
    for (const symbol of symbols) {
      if (!symbol.aliasOf) {
        continue;
      }
      const target = symbols.find((s) => s.name === symbol.aliasOf);
      if (target) {
        symbol.family = target.family;
        symbol.role = target.role;
        symbol.abstractMembers = target.abstractMembers;
        symbol.doc ??= target.doc;
      }
    }

    this.cache = symbols.sort((a, b) => a.name.localeCompare(b.name));
    return this.cache;
  }

  /** One symbol by name, case-insensitively. */
  find(name: string, from?: string): StereotypeSymbol | undefined {
    const wanted = name.toLowerCase();
    return this.read(from).find((s) => s.name.toLowerCase() === wanted);
  }

  /**
   * Names closest to a miss, for "did you mean".
   *
   * Substring matching alone is not enough: the most likely typo in this
   * library is a dropped plural, and "BrokenRuleManager" shares no substring
   * relationship with "BrokenRulesManager" in either direction.
   */
  suggest(name: string, from?: string): string[] {
    const wanted = name.toLowerCase();

    return this.read(from)
      .map((symbol) => {
        const candidate = symbol.name.toLowerCase();
        const contains =
          candidate.includes(wanted) || wanted.includes(candidate);
        return {
          name: symbol.name,
          distance: contains ? 0 : editDistance(wanted, candidate),
        };
      })
      .filter((entry) => entry.distance <= Math.max(3, name.length / 3))
      .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map((entry) => entry.name);
  }

  private declarationFiles(root: string): string[] {
    const found: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== 'node_modules') {
            walk(full);
          }
        } else if (entry.endsWith('.d.ts')) {
          found.push(full);
        }
      }
    };

    if (existsSync(root)) {
      walk(root);
    }

    return found;
  }

  private readStatement(
    statement: ts.Statement,
    source: ts.SourceFile,
    file: string,
  ): StereotypeSymbol | null {
    if (!this.isExported(statement)) {
      return null;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      return this.readClass(statement, source, file);
    }

    if (ts.isInterfaceDeclaration(statement)) {
      return this.base(
        statement.name.text,
        'interface',
        file,
        statement,
        source,
      );
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      return this.base(statement.name.text, 'type', file, statement, source);
    }

    if (ts.isEnumDeclaration(statement)) {
      return this.base(statement.name.text, 'enum', file, statement, source);
    }

    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations[0];
      if (declaration && ts.isIdentifier(declaration.name)) {
        const symbol = this.base(
          declaration.name.text,
          'const',
          file,
          statement,
          source,
        );

        // `const X: typeof Y` is an alias, not a value of its own. Someone
        // reading the library needs to know the two names are one thing.
        const alias = ALIAS_PATTERN.exec(
          declaration.type?.getText(source) ?? '',
        );
        if (alias) {
          symbol.aliasOf = alias[1];
        }

        return symbol;
      }
    }

    return null;
  }

  private readClass(
    node: ts.ClassDeclaration,
    source: ts.SourceFile,
    file: string,
  ): StereotypeSymbol {
    const name = node.name!.text;
    const isAbstract = this.hasModifier(node, ts.SyntaxKind.AbstractKeyword);

    let extendsName: string | undefined;
    const implementsNames: string[] = [];

    for (const clause of node.heritageClauses ?? []) {
      for (const type of clause.types) {
        const text = type.expression.getText(source);
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          extendsName = text;
        } else {
          implementsNames.push(text);
        }
      }
    }

    const members: MemberInfo[] = [];
    for (const member of node.members) {
      const info = this.readMember(member, source);
      if (info) {
        members.push(info);
      }
    }

    const family = this.classifyFamily(file, name);

    return {
      name,
      kind: 'class',
      isAbstract,
      extends: extendsName,
      implements: implementsNames,
      typeParameters: (node.typeParameters ?? []).map((p) => p.getText(source)),
      abstractMembers: members.filter((m) => m.isAbstract),
      members: members.filter((m) => !m.isAbstract),
      doc: this.readDoc(node, source),
      file,
      family,
      role: this.classifyRole(name, isAbstract, members),
    };
  }

  private readMember(
    member: ts.ClassElement,
    source: ts.SourceFile,
  ): MemberInfo | null {
    if (this.hasModifier(member, ts.SyntaxKind.PrivateKeyword)) {
      return null;
    }

    const name = member.name?.getText(source);
    if (!name && !ts.isConstructorDeclaration(member)) {
      return null;
    }

    return {
      name: name ?? 'constructor',
      signature: member.getText(source).replace(/\s+/g, ' ').trim(),
      isStatic: this.hasModifier(member, ts.SyntaxKind.StaticKeyword),
      isAbstract: this.hasModifier(member, ts.SyntaxKind.AbstractKeyword),
      doc: this.readDoc(member, source),
    };
  }

  private base(
    name: string,
    kind: StereotypeSymbol['kind'],
    file: string,
    node: ts.Node,
    source: ts.SourceFile,
  ): StereotypeSymbol {
    return {
      name,
      kind,
      isAbstract: false,
      implements: [],
      typeParameters: [],
      abstractMembers: [],
      members: [],
      doc: this.readDoc(node, source),
      file,
      family: this.classifyFamily(file, name),
      role: kind === 'interface' ? 'implement' : 'use',
    };
  }

  private readDoc(node: ts.Node, source: ts.SourceFile): string | undefined {
    const ranges = ts.getLeadingCommentRanges(source.getFullText(), node.pos);
    if (!ranges?.length) {
      return undefined;
    }

    const text = ranges
      .map((range) => source.getFullText().slice(range.pos, range.end))
      .filter((comment) => comment.startsWith('/**'))
      .join('\n');

    if (!text) {
      return undefined;
    }

    return text
      .replace(/^\/\*\*/, '')
      .replace(/\*\/$/, '')
      .split('\n')
      .map((line) => line.replace(/^\s*\*ers?\s?/, '').replace(/^\s*\*\s?/, ''))
      .join('\n')
      .trim();
  }

  private hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    return (
      ts.canHaveModifiers(node) &&
      (ts.getModifiers(node) ?? []).some((m) => m.kind === kind)
    );
  }

  private isExported(node: ts.Statement): boolean {
    return this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
  }

  /** Families follow the library's own folder layout. */
  private classifyFamily(file: string, name: string): StereotypeFamily {
    if (/validator|business-rules|broken-rule/i.test(file)) {
      return 'Validation & Business Rules';
    }
    if (/exception/i.test(file) || /Exception$/.test(name)) {
      return 'Exceptions';
    }
    if (/valueobject/i.test(file)) {
      return 'Value Objects';
    }
    if (/aggregate/i.test(file)) {
      return 'Aggregates';
    }
    if (/event/i.test(file)) {
      return 'Domain Events';
    }
    if (/tracking|state/i.test(file)) {
      return 'State & Tracking';
    }
    return 'Infrastructure';
  }

  /**
   * Extend vs compose is the distinction that matters when learning this
   * library: aggregates delegate to managers rather than inheriting their
   * behaviour, and knowing which is which is most of understanding the design.
   */
  private classifyRole(
    name: string,
    isAbstract: boolean,
    members: MemberInfo[],
  ): StereotypeRole {
    // Some bases are abstract by intent and convention without carrying the
    // keyword in their emitted declaration; the name is the reliable signal.
    if (
      isAbstract ||
      members.some((m) => m.isAbstract) ||
      /^Abstract/.test(name)
    ) {
      return 'extend';
    }
    if (/(Manager|Orchestrator|Detector|Extension|Context)$/.test(name)) {
      return 'compose';
    }
    if (
      /(Helper|Builder|Extensions|Serializer|Equality|Identity)$/.test(name)
    ) {
      return 'use';
    }
    return 'use';
  }
}

import { Injectable } from '@nestjs/common';

import { Artifact, artifact } from '../generation/artifact.model';
import { fileStem, toCamelCase } from '../generation/naming';
import { LibraryIntrospectorService } from '../library/library-introspector.service';
import { MemberInfo, StereotypeSymbol } from '../library/stereotype.model';

export interface ExtendRequest {
  /** The library base to subclass. */
  base: string;
  /** The new class name. */
  name: string;
  /** Destination folder, relative to the source root. */
  directory: string;
}

/**
 * Scaffolds a subclass of any library base.
 *
 * The contract is derived from the installed declarations rather than a table
 * kept in this CLI: whatever the introspector reports as abstract becomes a
 * stub. That is what makes this work for bases this command has never heard
 * of, and keeps it correct when the library adds one.
 */
@Injectable()
export class ScaffoldService {
  constructor(private readonly library: LibraryIntrospectorService) {}

  /** Bases that can meaningfully be subclassed. */
  extendableBases(): StereotypeSymbol[] {
    return this.library.read().filter((symbol) => symbol.role === 'extend');
  }

  extend(request: ExtendRequest): Artifact[] {
    const base = this.library.find(request.base);

    if (!base) {
      const suggestions = this.library.suggest(request.base);
      throw new Error(
        `No symbol named "${request.base}" in @nestjslatam/ddd-lib.` +
          (suggestions.length
            ? `\n\n  Did you mean: ${suggestions.join(', ')}?`
            : ''),
      );
    }

    if (base.role !== 'extend') {
      const advice =
        base.role === 'compose'
          ? `${base.name} is a collaborator: an aggregate or value object holds one and delegates to it, rather than subclassing it.`
          : base.role === 'implement'
            ? `${base.name} is an interface. Implement it on a class of your own instead of extending it.`
            : `${base.name} is meant to be called directly, not subclassed.`;

      throw new Error(
        `${base.name} is not a base class.\n\n  ${advice}\n\n  ` +
          `Run \`ddd list --role extend\` to see what can be extended.`,
      );
    }

    const stem = fileStem(request.name);
    const path = `${request.directory}/${stem}.ts`.replace(/^\/+/, '');

    return [
      artifact('aggregate', path, this.renderSubclass(base, request.name)),
    ];
  }

  private renderSubclass(base: StereotypeSymbol, name: string): string {
    const generics = base.typeParameters.length
      ? `<${base.typeParameters.map(() => 'unknown').join(', ')}>`
      : '';

    const stubs = base.abstractMembers
      .map((member) => this.renderStub(member))
      .join('\n\n');

    const contractNote = base.abstractMembers.length
      ? `\n *\n * ${base.name} requires ${base.abstractMembers
          .map((m) => m.name)
          .join(', ')}; the stub${
          base.abstractMembers.length > 1 ? 's' : ''
        } below must be completed.`
      : '';

    return `import { ${base.name} } from '@nestjslatam/ddd-lib';

/**
 * TODO: describe what ${name} represents in your domain.${contractNote}
 */
export class ${name} extends ${base.name}${generics} {
${stubs || '  // The base defines no abstract members; add your own behaviour.'}
}`;
  }

  /**
   * Turns an abstract signature into a stub.
   *
   * The return type is preserved so the file type-checks the moment the body
   * is filled in, and `super` is called where the base is likely to define
   * behaviour worth keeping -- dropping it is a common and silent mistake.
   */
  private renderStub(member: MemberInfo): string {
    const signature = member.signature
      .replace(/^\s*(public|protected)?\s*abstract\s+/, '')
      .replace(/;$/, '');

    const returnsVoid = /:\s*void\s*$/.test(signature) || !/:/.test(signature);
    const body = returnsVoid
      ? `    // TODO: implement.`
      : `    throw new Error('${member.name} is not implemented yet.');`;

    return `  ${signature} {
${body}
  }`;
  }

  /** A one-line reminder of how to register the result, when relevant. */
  followUp(base: StereotypeSymbol, name: string): string | null {
    switch (base.name) {
      case 'AbstractRuleValidator':
        return `Add it in the subject's addValidators(): this.validatorRules.add(new ${name}(this));`;
      case 'AbstractValidator':
      case 'EntityValidator':
      case 'ValueObjectValidator':
        return `Add it in the aggregate's addValidators(): this.validators.add(new ${name}(this));`;
      case 'DddAggregateRoot':
        return `Give it a private constructor and static create()/load() factories, the way the library's own aggregates are built.`;
      case 'DomainException':
        return `Throw it from the domain when the rule it names is violated.`;
      default:
        return null;
    }
  }

  /** Suggested destination for a subclass of this base. */
  defaultDirectory(base: StereotypeSymbol, name: string): string {
    switch (base.family) {
      case 'Value Objects':
        return 'shared/valueobjects';
      case 'Validation & Business Rules':
        return 'shared/valueobjects/validators';
      case 'Exceptions':
        return 'shared/exceptions';
      case 'Domain Events':
        return `${fileStem(toCamelCase(name))}/domain/events`;
      default:
        return 'domain';
    }
  }
}

import * as ts from 'typescript';

import { Finding } from './finding.model';

export interface RuleContext {
  source: ts.SourceFile;
  /** Path shown in output, relative to the project root. */
  file: string;
}

export type IdiomRule = (context: RuleContext) => Finding[];

const lineOf = (source: ts.SourceFile, node: ts.Node): number =>
  source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

const isClassExtending = (
  node: ts.Node,
  pattern: RegExp,
): node is ts.ClassDeclaration =>
  ts.isClassDeclaration(node) &&
  (node.heritageClauses ?? []).some(
    (clause) =>
      clause.token === ts.SyntaxKind.ExtendsKeyword &&
      clause.types.some((type) => pattern.test(type.expression.getText())),
  );

const methodNamed = (
  node: ts.ClassDeclaration,
  name: string,
): ts.MethodDeclaration | undefined =>
  node.members.find(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) && member.name?.getText() === name,
  );

const walk = (node: ts.Node, visit: (n: ts.Node) => void): void => {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
};

/**
 * Bases whose own addValidators() registers real validators.
 *
 * Verified against the library source: DddValueObject.addValidators() and
 * DddAggregateRoot's are empty hooks, so a subclass of those loses nothing by
 * not chaining. These three do register rules -- NumberNotNullValidator,
 * NumberPositiveValidator, StringNotNullOrEmptyValidator -- and skipping super
 * silently drops them. Narrowing to these keeps the rule quiet where it would
 * only be noise.
 */
const BASES_WITH_VALIDATORS =
  /^(StringValueObject|NumberValueObject|IdValueObject)$/;

/**
 * addValidators() must call super when the base registers validators.
 *
 * An override that does not chain silently discards them, and the value object
 * then accepts input the library was supposed to reject -- with no error
 * anywhere to explain it.
 */
export const superAddValidators: IdiomRule = ({ source, file }) => {
  const findings: Finding[] = [];

  walk(source, (node) => {
    if (!isClassExtending(node, BASES_WITH_VALIDATORS)) {
      return;
    }

    const method = methodNamed(node, 'addValidators');
    if (!method?.body) {
      return;
    }

    const chains = method.body.getText().includes('super.addValidators(');
    if (chains) {
      return;
    }

    findings.push({
      rule: 'super-add-validators',
      severity: 'error',
      file,
      line: lineOf(source, method),
      message: `${node.name?.getText() ?? 'This class'}.addValidators() does not call super.addValidators()`,
      detail:
        'The base adds its own rules there. Without the super call they are ' +
        'dropped, and invalid values pass validation with no error raised.',
    });
  });

  return findings;
};

/**
 * addValidators() must not read state the subclass assigns after super().
 *
 * DddValueObject's constructor calls addValidators() before the subclass
 * constructor body runs. Reading a field initialised there throws on every
 * construction. This is exactly how NumberValueObject shipped broken through
 * two releases of the library.
 */
export const noSubclassStateInAddValidators: IdiomRule = ({ source, file }) => {
  const findings: Finding[] = [];

  walk(source, (node) => {
    if (!ts.isClassDeclaration(node)) {
      return;
    }

    const method = methodNamed(node, 'addValidators');
    if (!method?.body) {
      return;
    }

    // Fields the constructor assigns after calling super().
    const constructor = node.members.find(ts.isConstructorDeclaration);
    if (!constructor?.body) {
      return;
    }

    const statements = constructor.body.statements;
    const superIndex = statements.findIndex((statement) =>
      statement.getText().startsWith('super('),
    );
    if (superIndex < 0) {
      return;
    }

    const assignedAfterSuper = new Set<string>();
    for (const statement of statements.slice(superIndex + 1)) {
      const match = /^this\.(\w+)\s*=/.exec(statement.getText().trim());
      if (match) {
        assignedAfterSuper.add(match[1]);
      }
    }

    if (!assignedAfterSuper.size) {
      return;
    }

    walk(method.body, (inner) => {
      if (
        !ts.isPropertyAccessExpression(inner) ||
        inner.expression.kind !== ts.SyntaxKind.ThisKeyword
      ) {
        return;
      }

      const property = inner.name.getText();
      if (!assignedAfterSuper.has(property)) {
        return;
      }

      findings.push({
        rule: 'no-subclass-state-in-add-validators',
        severity: 'error',
        file,
        line: lineOf(source, inner),
        message: `addValidators() reads this.${property}, which the constructor assigns after super()`,
        detail:
          'The base constructor calls addValidators() before the subclass ' +
          'constructor body runs, so this.' +
          property +
          ' is still undefined and construction throws every time.',
      });
    });
  });

  return findings;
};

/**
 * A static create() must check isValid.
 *
 * The library collects broken rules rather than throwing, so a factory that
 * only constructs hands back an invalid object that looks fine until something
 * downstream trusts it.
 */
export const factoryChecksValidity: IdiomRule = ({ source, file }) => {
  const findings: Finding[] = [];

  walk(source, (node) => {
    if (!isClassExtending(node, /ValueObject|AggregateRoot/)) {
      return;
    }

    const isAggregate = isClassExtending(node, /AggregateRoot/);

    for (const member of node.members) {
      if (
        !ts.isMethodDeclaration(member) ||
        member.name?.getText() !== 'create' ||
        !member.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.StaticKeyword,
        ) ||
        !member.body
      ) {
        continue;
      }

      const body = member.body.getText();
      const owner = node.name?.getText() ?? 'This class';

      if (body.includes('brokenRules')) {
        continue;
      }

      // The two bases disagree on the shape of the same member:
      // DddAggregateRoot declares `isValid(): boolean`, DddValueObject
      // declares `get isValid(): boolean`. Reading the method as a property
      // tests a function -- always truthy -- so the guard never fires. A
      // substring check for "isValid" passes both forms, which is exactly how
      // this shipped in generated aggregates unnoticed.
      const callsIt = /\bisValid\s*\(/.test(body);
      const readsIt = /\bisValid\b/.test(body) && !callsIt;

      if (isAggregate && readsIt) {
        findings.push({
          rule: 'factory-checks-validity',
          severity: 'error',
          file,
          line: lineOf(source, member),
          message: `${owner}.create() reads isValid as a property, but it is a method on DddAggregateRoot`,
          detail:
            'The expression tests a function rather than a boolean, so it is ' +
            'always truthy and the guard never fires. Call it: isValid().',
        });
        continue;
      }

      if (!isAggregate && callsIt) {
        findings.push({
          rule: 'factory-checks-validity',
          severity: 'error',
          file,
          line: lineOf(source, member),
          message: `${owner}.create() calls isValid(), but it is a getter on DddValueObject`,
          detail:
            'Calling a boolean getter throws "isValid is not a function" at ' +
            'runtime. Read it as a property: isValid.',
        });
        continue;
      }

      if (callsIt || readsIt) {
        continue;
      }

      findings.push({
        rule: 'factory-checks-validity',
        severity: 'warning',
        file,
        line: lineOf(source, member),
        message: `${owner}.create() never checks isValid`,
        detail:
          'Validation collects broken rules instead of throwing, so this ' +
          'factory can return an object that failed its own invariants.',
      });
    }
  });

  return findings;
};

/**
 * A command handler must commit through the publisher context.
 *
 * An aggregate collects its domain events; only mergeObjectContext(...) plus
 * commit() dispatches them. Without it the handler succeeds, the write lands,
 * and every event handler downstream simply never runs.
 */
export const handlerCommitsEvents: IdiomRule = ({ source, file }) => {
  const findings: Finding[] = [];

  walk(source, (node) => {
    if (!ts.isClassDeclaration(node)) {
      return;
    }

    const decorators = ts.canHaveDecorators(node)
      ? (ts.getDecorators(node) ?? [])
      : [];

    // Match the decorator being *called*, not any mention of the name. A
    // @Module listing a `CommandHandlers` array contains the substring, and
    // matching on text reported every module as an uncommitted handler.
    const isCommandHandler = decorators.some(
      (decorator) =>
        ts.isCallExpression(decorator.expression) &&
        decorator.expression.expression.getText() === 'CommandHandler',
    );
    if (!isCommandHandler) {
      return;
    }

    const text = node.getText();
    if (text.includes('mergeObjectContext') && text.includes('.commit()')) {
      return;
    }

    findings.push({
      rule: 'handler-commits-events',
      severity: 'warning',
      file,
      line: lineOf(source, node),
      message: `${node.name?.getText() ?? 'This handler'} never commits through the publisher context`,
      detail:
        'The aggregate collects its domain events; only ' +
        'mergeObjectContext(aggregate).commit() dispatches them. Without it ' +
        'the command succeeds and every event handler downstream is skipped.',
    });
  });

  return findings;
};

export const IDIOM_RULES: IdiomRule[] = [
  superAddValidators,
  noSubclassStateInAddValidators,
  factoryChecksValidity,
  handlerCommitsEvents,
];

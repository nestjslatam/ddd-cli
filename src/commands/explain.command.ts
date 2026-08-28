import { Command, CommandRunner, Option } from 'nest-commander';

import { LibraryIntrospectorService } from '../library/library-introspector.service';
import { StereotypeSymbol } from '../library/stereotype.model';
import { LlmProviderFactory } from '../llm/llm-provider.factory';
import { UiService } from '../ui/ui.service';

interface ExplainOptions {
  provider?: string;
  model?: string;
  /** Print the declaration only, with no model call. */
  raw?: boolean;
}

const SYSTEM_PROMPT = `You explain the @nestjslatam/ddd-lib library to a developer building a Domain-Driven Design application with NestJS.

You are given the real type declaration of one symbol, read from the version installed in the developer's project. Everything you say must follow from that declaration. Do not describe methods, options or behaviour that are not in it -- if the declaration does not answer something, say so rather than filling the gap.

Structure your answer with these four headings, each on its own line, in capitals:

WHAT IT IS
Two or three sentences. What role does this play in a DDD model, and when would a developer reach for it?

HOW TO USE IT
If it is a base class, the contract you must satisfy to extend it and what the base gives you in return. If it is a collaborator, how the aggregate or value object delegates to it. If it is an interface, what implementing it commits you to.

EXAMPLE
A short, realistic TypeScript snippet using only what the declaration shows. Indent every line of code by two spaces. Use a plausible business domain, not Foo and Bar. Keep it under 25 lines.

WATCH OUT FOR
One or two things that will actually bite someone, based on what the signatures imply: a protected constructor means static factories, an abstract member means the subclass must supply it, an options parameter means defaults exist that may not be what you want.

Write prose, not bullet-point fragments. Be concrete. Assume the reader knows TypeScript and NestJS but not this library.`;

@Command({
  name: 'explain',
  aliases: ['why'],
  arguments: '<symbol>',
  description:
    "Explain one of the library's stereotypes, anchored to its real declaration",
})
export class ExplainCommand extends CommandRunner {
  constructor(
    private readonly library: LibraryIntrospectorService,
    private readonly providers: LlmProviderFactory,
    private readonly ui: UiService,
  ) {
    super();
  }

  async run(args: string[], options: ExplainOptions = {}): Promise<void> {
    const name = args[0];
    const symbol = this.library.find(name);

    if (!symbol) {
      const suggestions = this.library.suggest(name);
      throw new Error(
        `No symbol named "${name}" in @nestjslatam/ddd-lib.` +
          (suggestions.length
            ? `\n\n  Did you mean: ${suggestions.join(', ')}?`
            : '\n\n  Run `ddd list` to see what is available.'),
      );
    }

    this.renderDeclaration(symbol);

    if (options.raw) {
      return;
    }

    const provider = this.providers.create({
      provider: options.provider,
      model: options.model,
    });

    this.ui.blank();
    this.ui.hint(`Explaining with ${provider.id} (${provider.model})…`);

    const explanation = await provider.generateText({
      system: SYSTEM_PROMPT,
      prompt: this.buildPrompt(symbol),
    });

    this.ui.blank();
    this.ui.rule();
    this.renderExplanation(explanation);
    this.ui.blank();
  }

  /**
   * The facts, printed before any model output.
   *
   * Keeping them visually separate matters: everything above the rule is read
   * from the installed declaration, everything below it is a model talking.
   */
  private renderDeclaration(symbol: StereotypeSymbol): void {
    const signature =
      `${symbol.isAbstract ? 'abstract ' : ''}${symbol.kind} ${symbol.name}` +
      (symbol.typeParameters.length
        ? `<${symbol.typeParameters.join(', ')}>`
        : '') +
      (symbol.extends ? ` extends ${symbol.extends}` : '') +
      (symbol.implements.length
        ? ` implements ${symbol.implements.join(', ')}`
        : '');

    this.ui.blank();
    this.ui.line(this.ui.strong(this.ui.accent(signature)));
    this.ui.line(
      [
        this.ui.subtle(symbol.file),
        this.ui.muted(symbol.family),
        this.ui.muted(symbol.role),
      ].join(this.ui.subtle(' · ')),
    );

    if (symbol.aliasOf) {
      this.ui.blank();
      this.ui.warn(
        `Alias for ${this.ui.strong(symbol.aliasOf)} — the two names are the same class.`,
      );
    }

    if (symbol.doc) {
      this.ui.blank();
      this.ui.paragraph(symbol.doc);
    }

    if (symbol.abstractMembers.length) {
      this.ui.heading('You must implement');
      for (const member of symbol.abstractMembers) {
        this.ui.line(this.ui.success(member.signature));
      }
    }

    const statics = symbol.members.filter((m) => m.isStatic);
    if (statics.length) {
      this.ui.heading('Static factories');
      for (const member of statics) {
        this.ui.line(this.ui.muted(member.signature));
      }
    }
  }

  /** Renders the model's answer, giving its section headings the brand accent. */
  private renderExplanation(explanation: string): void {
    for (const block of explanation.split('\n')) {
      if (/^[A-Z][A-Z ]{3,}$/.test(block.trim())) {
        this.ui.heading(this.ui.accent(block.trim()));
      } else {
        this.ui.paragraph(block);
      }
    }
  }

  /** Everything the model is allowed to reason from. */
  private buildPrompt(symbol: StereotypeSymbol): string {
    return [
      `Symbol: ${symbol.name}`,
      `Kind: ${symbol.isAbstract ? 'abstract ' : ''}${symbol.kind}`,
      `Declared in: ${symbol.file}`,
      symbol.aliasOf
        ? `This export is an alias for ${symbol.aliasOf}; they are the same class. Say so.`
        : '',
      symbol.extends ? `Extends: ${symbol.extends}` : '',
      symbol.implements.length
        ? `Implements: ${symbol.implements.join(', ')}`
        : '',
      symbol.doc ? `\nDocumentation from the declaration:\n${symbol.doc}` : '',
      symbol.abstractMembers.length
        ? `\nAbstract members a subclass must implement:\n${symbol.abstractMembers
            .map((m) => `  ${m.signature}`)
            .join('\n')}`
        : '',
      symbol.members.length
        ? `\nPublic members:\n${symbol.members
            .map((m) => `  ${m.signature}`)
            .join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  @Option({
    flags: '-r, --raw',
    description: 'Print the declaration only, without calling a model',
  })
  parseRaw(): boolean {
    return true;
  }

  @Option({
    flags: '-p, --provider <provider>',
    description: 'Model provider: anthropic or openai',
  })
  parseProvider(value: string): string {
    return value;
  }

  @Option({
    flags: '-m, --model <model>',
    description: "Model id, overriding the provider's default",
  })
  parseModel(value: string): string {
    return value;
  }
}

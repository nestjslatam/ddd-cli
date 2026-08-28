import { Injectable } from '@nestjs/common';

import { AggregateSpec } from './aggregate-spec.schema';
import { Artifact } from './artifact.model';
import { fileStem } from './naming';
import { renderAggregate } from './renderers/aggregate.renderer';
import { renderBarrel } from './renderers/barrel.renderer';
import { renderCommand } from './renderers/command.renderer';
import { renderDomainEvent } from './renderers/domain-event.renderer';
import { renderModule, renderRepository } from './renderers/module.renderer';
import { renderValueObject } from './renderers/value-object.renderer';

/**
 * Turns a validated aggregate model into the full set of files.
 *
 * Purely deterministic: the same spec always produces the same bytes. All the
 * non-determinism lives upstream in the planner, which keeps this layer
 * testable without a model provider.
 */
@Injectable()
export class ArtifactGeneratorService {
  generate(spec: AggregateSpec): Artifact[] {
    const slug = spec.slug!;
    const artifacts: Artifact[] = [];

    for (const valueObject of spec.valueObjects) {
      artifacts.push(...renderValueObject(valueObject));
    }

    artifacts.push(...renderAggregate(spec));

    for (const event of spec.events) {
      artifacts.push(renderDomainEvent(event, slug));
    }

    for (const command of spec.commands) {
      artifacts.push(...renderCommand(command, spec));
    }

    artifacts.push(renderRepository(spec));
    artifacts.push(renderModule(spec));
    artifacts.push(...this.barrels(spec, artifacts));

    return artifacts.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Emits an index.ts for every folder that got more than one sibling, matching
   * how the reference project imports (`from './validators'`).
   */
  private barrels(spec: AggregateSpec, produced: Artifact[]): Artifact[] {
    const slug = spec.slug!;
    const byFolder = new Map<string, string[]>();

    for (const item of produced) {
      const folder = item.path.slice(0, item.path.lastIndexOf('/'));
      const stem = item.path.slice(folder.length + 1, -'.ts'.length);
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), stem]);
    }

    const wanted = [
      `shared/valueobjects`,
      `shared/valueobjects/validators`,
      `${slug}/domain/${slug}-aggregate`,
      `${slug}/domain/${slug}-aggregate/events`,
      `${slug}/domain/${slug}-aggregate/validators`,
    ];

    return wanted
      .filter((folder) => byFolder.has(folder))
      .map((folder) =>
        renderBarrel(`${folder}/index.ts`, byFolder.get(folder)!),
      );
  }

  /** Human-readable summary used by the preview. */
  summarise(spec: AggregateSpec): string[] {
    return [
      `aggregate      ${spec.name} (${fileStem(spec.name)})`,
      `properties     ${spec.properties.length}`,
      `value objects  ${spec.valueObjects.length}`,
      `domain events  ${spec.events.length}`,
      `commands       ${spec.commands.length}`,
      `invariants     ${
        spec.invariants.length +
        spec.valueObjects.reduce((total, vo) => total + vo.rules.length, 0)
      }`,
    ];
  }
}

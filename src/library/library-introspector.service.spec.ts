import { LibraryIntrospectorService } from './library-introspector.service';

/**
 * Runs against the real @nestjslatam/ddd-lib installed in this repository.
 * That is deliberate: the point of the introspector is that it reports what is
 * actually installed, so a fixture would test the wrong thing.
 */
describe('LibraryIntrospectorService', () => {
  const service = new LibraryIntrospectorService();

  it('reads the installed declarations', () => {
    expect(service.read().length).toBeGreaterThan(50);
  });

  describe('the validation and business rules family', () => {
    it('groups the validator and broken-rule types together', () => {
      const family = service
        .read()
        .filter((s) => s.family === 'Validation & Business Rules')
        .map((s) => s.name);

      expect(family).toEqual(
        expect.arrayContaining([
          'AbstractRuleValidator',
          'AbstractValidator',
          'EntityValidator',
          'ValueObjectValidator',
          'BrokenRule',
          'BrokenRulesManager',
          'ValidatorRuleManager',
          'NumberNotNullValidator',
          'StringNotNullOrEmptyValidator',
        ]),
      );
    });

    it('surfaces the contract a rule validator must implement', () => {
      const symbol = service.find('AbstractRuleValidator')!;

      expect(symbol.role).toBe('extend');
      expect(symbol.abstractMembers.map((m) => m.name)).toContain('addRules');
    });

    it('marks the managers as collaborators, not base classes', () => {
      // The distinction that matters when learning the library: an aggregate
      // delegates to these rather than inheriting their behaviour.
      expect(service.find('BrokenRulesManager')!.role).toBe('compose');
      expect(service.find('ValidatorRuleManager')!.role).toBe('compose');
    });
  });

  describe('roles', () => {
    it('treats abstract bases as things you extend', () => {
      expect(service.find('AbstractValidator')!.role).toBe('extend');
      expect(service.find('AbstractRuleValidator')!.role).toBe('extend');
    });

    it('resolves an aliased export to its target', () => {
      // AbstractDomainEvent is emitted as
      // `export declare const AbstractDomainEvent: typeof DomainEvent`.
      // Reporting it as a plain const would hide that the two are one class.
      const alias = service.find('AbstractDomainEvent')!;

      expect(alias.aliasOf).toBe('DomainEvent');
      expect(alias.role).toBe(service.find('DomainEvent')!.role);
      expect(alias.family).toBe('Domain Events');
    });

    it('treats interfaces as things you implement', () => {
      expect(service.find('IRuleValidator')!.role).toBe('implement');
    });
  });

  describe('heritage', () => {
    it('records the base class of a derived stereotype', () => {
      expect(service.find('EntityValidator')!.extends).toBe(
        'AbstractValidator',
      );
      expect(service.find('NumberValueObject')!.extends).toContain(
        'DddValueObject',
      );
    });
  });

  describe('lookup', () => {
    it('finds a symbol regardless of case', () => {
      expect(service.find('brokenrule')?.name).toBe('BrokenRule');
    });

    it('returns undefined for an unknown name', () => {
      expect(service.find('NotAThing')).toBeUndefined();
    });

    it('suggests the right name for a dropped plural', () => {
      // Substring matching misses this; it is the most likely real typo.
      expect(service.suggest('BrokenRuleManager')).toContain(
        'BrokenRulesManager',
      );
    });

    it('suggests the right name for a single-character slip', () => {
      expect(service.suggest('AbstractRuleValidatr')).toContain(
        'AbstractRuleValidator',
      );
    });
  });
});

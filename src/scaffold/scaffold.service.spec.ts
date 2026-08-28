import { LibraryIntrospectorService } from '../library/library-introspector.service';
import { ScaffoldService } from './scaffold.service';

describe('ScaffoldService', () => {
  const service = new ScaffoldService(new LibraryIntrospectorService());

  describe('extend', () => {
    it('derives the stub from the base contract, not a hardcoded table', () => {
      const [file] = service.extend({
        base: 'AbstractRuleValidator',
        name: 'OrderTotalRules',
        directory: 'shared/validators',
      });

      // addRules is abstract on the base; the stub exists because the
      // introspector reported it, so a base this CLI has never seen works too.
      expect(file.contents).toContain('extends AbstractRuleValidator');
      expect(file.contents).toContain('addRules()');
      expect(file.path).toBe('shared/validators/order-total-rules.ts');
    });

    it('refuses to subclass a collaborator, and says what to do instead', () => {
      expect(() =>
        service.extend({
          base: 'BrokenRulesManager',
          name: 'X',
          directory: 'd',
        }),
      ).toThrow(/collaborator/);
    });

    it('refuses to subclass an interface', () => {
      expect(() =>
        service.extend({ base: 'IRuleValidator', name: 'X', directory: 'd' }),
      ).toThrow(/interface/);
    });

    it('suggests a near-miss base name', () => {
      expect(() =>
        service.extend({
          base: 'AbstractRuleValidatr',
          name: 'X',
          directory: 'd',
        }),
      ).toThrow(/AbstractRuleValidator/);
    });
  });

  describe('follow-up guidance', () => {
    it('tells you how to register a rule validator', () => {
      const base = new LibraryIntrospectorService().find(
        'AbstractRuleValidator',
      )!;
      expect(service.followUp(base, 'MyRules')).toContain(
        'this.validatorRules.add(new MyRules(this))',
      );
    });
  });
});

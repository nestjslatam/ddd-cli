import { LibraryIntrospectorService } from '../library/library-introspector.service';
import { ValidateService } from './validate.service';

/**
 * The shape detection reads the installed declaration.
 *
 * A getter is emitted as `get isValid(): boolean`, so a regex looking for
 * `isValid(` matches it too -- the parentheses are there either way. Matching
 * on those alone reported every getter as a method, which inverted the
 * diagnosis: the rule then expected `isValid()` and stayed silent on exactly
 * the call site it exists to catch.
 */
describe('detecting how the installed library declares isValid', () => {
  const shapeOf = (signature: string): 'getter' | 'method' => {
    const service = new ValidateService({
      find: () => ({ members: [{ name: 'isValid', signature }] }),
    } as unknown as LibraryIntrospectorService);

    return (
      service as unknown as {
        aggregateIsValidShape(): 'getter' | 'method';
      }
    ).aggregateIsValidShape();
  };

  it('reads a getter declaration as a getter', () => {
    expect(shapeOf('get isValid(): boolean;')).toBe('getter');
    expect(shapeOf('public get isValid(): boolean;')).toBe('getter');
  });

  it('reads a method declaration as a method', () => {
    expect(shapeOf('isValid(): boolean;')).toBe('method');
    expect(shapeOf('public isValid(): boolean;')).toBe('method');
  });

  it('assumes the current shape when the library is absent', () => {
    const service = new ValidateService({
      find: () => {
        throw new Error('not installed');
      },
    } as unknown as LibraryIntrospectorService);

    expect(
      (
        service as unknown as {
          aggregateIsValidShape(): 'getter' | 'method';
        }
      ).aggregateIsValidShape(),
    ).toBe('getter');
  });
});

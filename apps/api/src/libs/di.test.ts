import { describe, expect, test } from 'bun:test'
import { container, inject, injectable } from 'tsyringe'

interface IGreeter {
  greet(name: string): string
}

const greeterToken = Symbol('IGreeter').toString()

@injectable()
class ThaiGreeter implements IGreeter {
  greet(name: string) {
    return `สวัสดี ${name}`
  }
}

@injectable()
class WelcomeUseCase {
  constructor(@inject(greeterToken) private readonly greeter: IGreeter) {}

  execute(name: string) {
    return this.greeter.greet(name)
  }
}

@injectable()
class WelcomeController {
  constructor(@inject(WelcomeUseCase) private readonly welcome: WelcomeUseCase) {}

  handle(name: string) {
    return this.welcome.execute(name)
  }
}

describe('dependency injection', () => {
  test('resolves a port by token and a use case by class', () => {
    const scope = container.createChildContainer()
    scope.register(greeterToken, { useClass: ThaiGreeter })

    expect(scope.resolve(WelcomeController).handle('ร้านค้า')).toBe('สวัสดี ร้านค้า')
  })

  test('a different adapter can be bound without touching the use case', () => {
    const scope = container.createChildContainer()
    scope.register<IGreeter>(greeterToken, { useValue: { greet: (name) => `Hello ${name}` } })

    expect(scope.resolve(WelcomeUseCase).execute('shop')).toBe('Hello shop')
  })
})

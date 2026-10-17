import { describe, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { useCartStore } from '../../pos/store/cart.store'
import { useRegisterSelectionStore } from '../../shifts/store/register-selection'
import { handOverSession } from './hand-over-session'

const ME = ['auth', 'me'] as const

describe('handOverSession', () => {
  test('keeps the signed-in user query and never sets it to null, so the login page never shows', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(ME, { id: 1 })

    await handOverSession(queryClient, ME)

    expect(queryClient.getQueryData(ME)).toEqual({ id: 1 })
    expect(queryClient.getQueryState(ME)?.isInvalidated).toBe(true)
  })

  test("drops every other cached query so the next person never sees the last one's data", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(ME, { id: 1 })
    queryClient.setQueryData(['products'], [{ id: 7 }])

    await handOverSession(queryClient, ME)

    expect(queryClient.getQueryData(['products'])).toBeUndefined()
  })

  test('leaves the cart and the till register choice of the new person in place', async () => {
    const queryClient = new QueryClient()
    useCartStore.setState({ lines: [{ key: '5:', productId: 5, optionIds: [], quantity: 2 }], memberId: 9, discount: '10' })
    useRegisterSelectionStore.setState({ selections: { '7': 1 } })

    await handOverSession(queryClient, ME)
    useRegisterSelectionStore.getState().handOver(7, 3)

    const cart = useCartStore.getState()
    expect(cart.lines).toEqual([{ key: '5:', productId: 5, optionIds: [], quantity: 2 }])
    expect(cart.memberId).toBe(9)
    expect(cart.discount).toBe('10')
    expect(useRegisterSelectionStore.getState().selections).toEqual({ '7': 3 })
  })
})

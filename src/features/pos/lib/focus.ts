/**
 * Whether the device has a mouse or keyboard. Refocusing the search box on a touch screen
 * would pop the on-screen keyboard open after every tap.
 */
export const hasKeyboard = () => window.matchMedia('(pointer: fine)').matches

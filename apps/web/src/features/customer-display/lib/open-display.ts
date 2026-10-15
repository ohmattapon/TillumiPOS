/** Opens the customer's screen in its own window; a window with this name is reused if it is already open. */
export function openCustomerDisplay() {
  window.open('/customer', 'easypos-customer', 'popup=yes,width=1280,height=720')
}

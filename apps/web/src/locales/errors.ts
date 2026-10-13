/**
 * The API answers in Thai and says what went wrong with a stable `code`. When the shop uses another
 * language, the web translates by code; codes missing here fall back to the Thai message from the server.
 * Values in `{{braces}}` come from the `params` the API sends with the error.
 */
export const errors = {
  en: {
    UNAUTHORIZED: 'Please sign in.',
    FORBIDDEN: 'You do not have permission to do this.',
    NOT_FOUND: 'Not found.',
    VALIDATION: 'Some of the information is not valid.',
    PARSE: 'The request could not be read.',
    INVALID_FILE_TYPE: 'The file must be a JPEG, PNG or WebP image.',
    INTERNAL: 'Something went wrong on the server.',
    DUPLICATE: 'This already exists.',
    IN_USE: 'This is in use elsewhere, or refers to something that does not exist.',
    LAST_OWNER: 'There must be at least one active owner.',
    STOCK_NOT_TRACKED: 'This product does not track stock.',
    NO_CHANGE: 'The counted quantity already matches the system.',
    PRODUCT_NOT_FOUND: 'Product {{productId}} was not found.',
    PRODUCT_INACTIVE: '"{{name}}" is no longer for sale.',
    INSUFFICIENT_STOCK: 'Only {{available}} of "{{name}}" left, which is not enough to sell.',
    UNDERPAID: 'The amount paid does not cover the total.',
    OVERPAID: 'Non-cash payments exceed the amount due.',
    DISCOUNT_TOO_LARGE: 'The discount is larger than the subtotal.',
    AMOUNT_TOO_LARGE: 'The amount is larger than the system supports.',
    ALREADY_VOIDED: 'This sale has already been voided.',
    MEDIA_UNAVAILABLE: 'Image storage is not reachable. Please try again.',
    INVALID_SHOP_SETTINGS: 'These settings are not valid.',
    INVALID_BRANCH: 'These branch details are not valid.',
    INVALID_BRANCH_ID: 'The branch id is not valid.',
    BRANCH_NOT_FOUND: 'Branch not found.',
    BRANCH_FORBIDDEN: 'You may only work in your own branch.',
    BRANCH_INACTIVE: 'This branch is closed.',
    BRANCH_CODE_TAKEN: 'This branch code is already used.',
    BRANCH_IN_USE: 'The last open branch, or one that still has active staff, cannot be closed.',
  },
}

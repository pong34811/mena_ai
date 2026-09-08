import '@testing-library/jest-dom/vitest'

// jsdom does not implement scrollIntoView; ChatPage calls it on every
// message update, so stub it globally for tests.
Element.prototype.scrollIntoView = () => {}

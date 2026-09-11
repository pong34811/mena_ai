import '@testing-library/jest-dom/vitest'

// jsdom does not implement scrollIntoView; ChatPage calls it on every
// message update, so stub it globally for tests.
Element.prototype.scrollIntoView = () => {}

// jsdom lacks HTMLMediaElement.setSinkId, which the output device
// selector/hook rely on for feature detection.
Object.defineProperty(window.HTMLMediaElement.prototype, 'setSinkId', {
  configurable: true,
  writable: true,
  value: async function () {},
})

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement ResizeObserver. The report builder canvas and
// Recharts' ResponsiveContainer both use it just to measure their own
// element — never anything that needs a real size — so a no-op stub is
// enough to let those pages mount in a test at all.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;

// jsdom doesn't implement the Pointer Events capture methods Radix's Select
// (and other Radix primitives built on it) call on every pointer
// interaction — without these, clicking an option throws "hasPointerCapture
// is not a function" instead of actually selecting it.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

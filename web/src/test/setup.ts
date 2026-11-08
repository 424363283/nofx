import { vi } from 'vitest'
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn().mockImplementation(query=>({matches:false,media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}))})
class ResizeObserverMock { observe(){} unobserve(){} disconnect(){} }
Object.defineProperty(window,'ResizeObserver',{writable:true,value:ResizeObserverMock})
Object.defineProperty(globalThis,'ResizeObserver',{writable:true,value:ResizeObserverMock})
const getStyle=window.getComputedStyle.bind(window)
window.getComputedStyle=(element)=>getStyle(element)
window.scrollTo=vi.fn()
Element.prototype.scrollTo=vi.fn()

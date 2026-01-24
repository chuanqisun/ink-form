import { describe, it, expect, beforeEach, vi } from "vitest";
import { CanvasOrientationManager } from "../components/canvas-orientation";

describe("CanvasOrientationManager", () => {
  let manager: CanvasOrientationManager;

  beforeEach(() => {
    manager = new CanvasOrientationManager(["canvas1", "canvas2"]);
  });

  it("should initialize with vertical orientation", () => {
    expect(manager.getOrientation()).toBe("vertical");
    expect(manager.getDimensions()).toEqual({ width: 720, height: 1280 });
  });

  it("should toggle to horizontal orientation", () => {
    manager.toggle();
    
    expect(manager.getOrientation()).toBe("horizontal");
    expect(manager.getDimensions()).toEqual({ width: 1280, height: 720 });
  });

  it("should toggle back to vertical orientation", () => {
    manager.toggle(); // to horizontal
    manager.toggle(); // back to vertical
    
    expect(manager.getOrientation()).toBe("vertical");
    expect(manager.getDimensions()).toEqual({ width: 720, height: 1280 });
  });

  it("should emit orientationchange event on toggle", () => {
    const listener = vi.fn();
    manager.addEventListener("orientationchange", listener);
    
    manager.toggle();
    
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.orientation).toBe("horizontal");
  });

  it("should set specific orientation", () => {
    manager.setOrientation("horizontal");
    
    expect(manager.getOrientation()).toBe("horizontal");
    expect(manager.getDimensions()).toEqual({ width: 1280, height: 720 });
  });

  it("should not change orientation if already set", () => {
    const listener = vi.fn();
    manager.addEventListener("orientationchange", listener);
    
    manager.setOrientation("vertical"); // Already vertical
    
    expect(listener).not.toHaveBeenCalled();
  });
});

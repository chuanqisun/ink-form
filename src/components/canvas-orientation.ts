/**
 * Manages canvas orientation and dimensions
 * Supports horizontal (16:9) and vertical (9:16) orientations
 */
export class CanvasOrientationManager extends EventTarget {
  private orientation: "horizontal" | "vertical" = "vertical";
  private canvasIds: string[];
  
  // Standard dimensions for each orientation
  private readonly HORIZONTAL = { width: 1280, height: 720 }; // 16:9
  private readonly VERTICAL = { width: 720, height: 1280 }; // 9:16

  constructor(canvasIds: string[]) {
    super();
    this.canvasIds = canvasIds;
  }

  /**
   * Get current orientation
   */
  getOrientation(): "horizontal" | "vertical" {
    return this.orientation;
  }

  /**
   * Get current dimensions
   */
  getDimensions(): { width: number; height: number } {
    return this.orientation === "horizontal" ? this.HORIZONTAL : this.VERTICAL;
  }

  /**
   * Toggle between horizontal and vertical orientations
   */
  toggle(): void {
    this.orientation = this.orientation === "horizontal" ? "vertical" : "horizontal";
    this.applyOrientation();
    this.dispatchEvent(new CustomEvent("orientationchange", { detail: { orientation: this.orientation } }));
  }

  /**
   * Set specific orientation
   */
  setOrientation(orientation: "horizontal" | "vertical"): void {
    if (this.orientation === orientation) return;
    this.orientation = orientation;
    this.applyOrientation();
    this.dispatchEvent(new CustomEvent("orientationchange", { detail: { orientation: this.orientation } }));
  }

  /**
   * Apply current orientation to all managed canvases
   */
  private applyOrientation(): void {
    const dimensions = this.getDimensions();
    
    this.canvasIds.forEach((id) => {
      const canvas = document.getElementById(id) as HTMLCanvasElement | null;
      if (canvas) {
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
      }
    });
  }

  /**
   * Initialize with current orientation
   */
  initialize(): void {
    this.applyOrientation();
  }
}

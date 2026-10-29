export interface InputState {
  throttle: number; // -1 to 1 (A/D or Left/Right)
  handbrake: boolean; // Space
  toggleMode: boolean; // E
  cycleTirePressure: boolean; // T
  recoverHold: number; // seconds R is held
  restartHold: number; // seconds Backspace is held
  hookAimWorld: { x: number; y: number };
  fireHookPressed: boolean; // LMB click
  winchIn: boolean; // RMB or Shift
  winchOut: boolean; // Ctrl
  pausePressed: boolean; // Esc
  toggleDebug: boolean; // F3
  toggleWireframe: boolean; // F4
  toggleBrush: boolean; // F5
  brushActive: boolean;
  brushWorldPos: { x: number; y: number };
}

export class InputManager {
  private keysDown: Set<string> = new Set();
  private keysPressed: Set<string> = new Set();
  private mouseCanvasPos: { x: number; y: number } = { x: 0, y: 0 };
  private mouseWorldPos: { x: number; y: number } = { x: 0, y: 0 };
  private isLmbDown: boolean = false;
  private isRmbDown: boolean = false;
  private lmbClicked: boolean = false;

  // Touch virtual overrides
  public touchThrottle: number = 0;
  public touchHandbrake: boolean = false;
  public touchWinchIn: boolean = false;
  public touchWinchOut: boolean = false;
  public touchFireHook: boolean = false;
  public touchAimWorld: { x: number; y: number } | null = null;

  private rHoldTime: number = 0;
  private backspaceHoldTime: number = 0;

  private canvasElement: HTMLCanvasElement | null = null;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
  }

  public attach(canvas: HTMLCanvasElement): void {
    this.canvasElement = canvas;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  public detach(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    if (this.canvasElement) {
      this.canvasElement.removeEventListener('mousedown', this.handleMouseDown);
      this.canvasElement.removeEventListener('contextmenu', this.handleContextMenu);
    }
    window.removeEventListener('mouseup', this.handleMouseUp);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.keysDown.has(e.code)) {
      this.keysPressed.add(e.code);
    }
    this.keysDown.add(e.code);

    // Prevent scrolling on Space / Arrow keys / Backspace during gameplay
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) {
      e.preventDefault();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.code);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.canvasElement) return;
    const rect = this.canvasElement.getBoundingClientRect();
    const scaleX = 480 / rect.width;
    const scaleY = 270 / rect.height;
    this.mouseCanvasPos = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      this.isLmbDown = true;
      this.lmbClicked = true;
    } else if (e.button === 2) {
      this.isRmbDown = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.isLmbDown = false;
    } else if (e.button === 2) {
      this.isRmbDown = false;
    }
  }

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
  }

  /**
   * Updates world coordinates of the mouse based on camera transform.
   */
  public updateWorldCoordinates(screenToWorld: (screenX: number, screenY: number) => { x: number; y: number }): void {
    this.mouseWorldPos = screenToWorld(this.mouseCanvasPos.x, this.mouseCanvasPos.y);
  }

  public poll(dt: number): InputState {
    let throttle = 0;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) throttle += 1;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) throttle -= 1;
    if (this.touchThrottle !== 0) throttle = this.touchThrottle;

    const handbrake = this.keysDown.has('Space') || this.touchHandbrake;
    const toggleMode = this.keysPressed.has('KeyE');
    const cycleTirePressure = this.keysPressed.has('KeyT');

    if (this.keysDown.has('KeyR')) {
      this.rHoldTime += dt;
    } else {
      this.rHoldTime = 0;
    }

    if (this.keysDown.has('Backspace')) {
      this.backspaceHoldTime += dt;
    } else {
      this.backspaceHoldTime = 0;
    }

    const fireHook = this.lmbClicked || this.touchFireHook;
    const winchIn = this.isRmbDown || this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight') || this.touchWinchIn;
    const winchOut = this.keysDown.has('ControlLeft') || this.keysDown.has('ControlRight') || this.touchWinchOut;

    const aimWorld = this.touchAimWorld || this.mouseWorldPos;

    const state: InputState = {
      throttle: Math.max(-1, Math.min(1, throttle)),
      handbrake,
      toggleMode,
      cycleTirePressure,
      recoverHold: this.rHoldTime,
      restartHold: this.backspaceHoldTime,
      hookAimWorld: { ...aimWorld },
      fireHookPressed: fireHook,
      winchIn,
      winchOut,
      pausePressed: this.keysPressed.has('Escape'),
      toggleDebug: this.keysPressed.has('F3'),
      toggleWireframe: this.keysPressed.has('F4'),
      toggleBrush: this.keysPressed.has('F5'),
      brushActive: this.isLmbDown,
      brushWorldPos: { ...this.mouseWorldPos },
    };

    // Reset single-frame flags
    this.keysPressed.clear();
    this.lmbClicked = false;
    this.touchFireHook = false;

    return state;
  }
}

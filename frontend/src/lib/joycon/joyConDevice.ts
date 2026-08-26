import {
  ACCEL_COEFFICIENT,
  GYRO_COEFFICIENT,
  JOYCON_L_PRODUCT_ID,
  JOYCON_R_PRODUCT_ID,
  NINTENDO_VENDOR_ID,
  OUTPUT_REPORT_ID,
  STANDARD_FULL_REPORT_ID,
  SUBCOMMAND,
} from "./constants";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type JoyConSide = "left" | "right";

export interface JoyConVector3 {
  x: number;
  y: number;
  z: number;
}

export interface JoyConButtons {
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  l: boolean;
  r: boolean;
  zl: boolean;
  zr: boolean;
  sl: boolean;
  sr: boolean;
  minus: boolean;
  plus: boolean;
  stick: boolean;
  home: boolean;
  capture: boolean;
}

export interface JoyConState {
  buttons: JoyConButtons;
  accel: JoyConVector3;
  gyro: JoyConVector3;
}

// WebHIDの入力レポートはreport idを含まないペイロードとして届くため、
// プロトコル資料の生バイト番号から1引いたオフセットになる。
const BUTTON_RIGHT_OFFSET = 2;
const BUTTON_SHARED_OFFSET = 3;
const BUTTON_LEFT_OFFSET = 4;
const IMU_FIRST_SAMPLE_OFFSET = 12;

function emptyButtons(): JoyConButtons {
  return {
    a: false,
    b: false,
    x: false,
    y: false,
    up: false,
    down: false,
    left: false,
    right: false,
    l: false,
    r: false,
    zl: false,
    zr: false,
    sl: false,
    sr: false,
    minus: false,
    plus: false,
    stick: false,
    home: false,
    capture: false,
  };
}

function readInt16LE(view: DataView, offset: number): number {
  return view.getInt16(offset, true);
}

function parseButtons(view: DataView, side: JoyConSide): JoyConButtons {
  const buttons = emptyButtons();
  const right = view.getUint8(BUTTON_RIGHT_OFFSET);
  const shared = view.getUint8(BUTTON_SHARED_OFFSET);
  const left = view.getUint8(BUTTON_LEFT_OFFSET);

  if (side === "right") {
    buttons.y = !!(right & 0x01);
    buttons.x = !!(right & 0x02);
    buttons.b = !!(right & 0x04);
    buttons.a = !!(right & 0x08);
    buttons.sr = !!(right & 0x10);
    buttons.sl = !!(right & 0x20);
    buttons.r = !!(right & 0x40);
    buttons.zr = !!(right & 0x80);
    buttons.stick = !!(shared & 0x04);
  } else {
    buttons.down = !!(left & 0x01);
    buttons.up = !!(left & 0x02);
    buttons.right = !!(left & 0x04);
    buttons.left = !!(left & 0x08);
    buttons.sr = !!(left & 0x10);
    buttons.sl = !!(left & 0x20);
    buttons.l = !!(left & 0x40);
    buttons.zl = !!(left & 0x80);
    buttons.stick = !!(shared & 0x08);
  }

  buttons.minus = !!(shared & 0x01);
  buttons.plus = !!(shared & 0x02);
  buttons.home = !!(shared & 0x10);
  buttons.capture = !!(shared & 0x20);

  return buttons;
}

function parseImuSample(
  view: DataView,
  offset: number,
): { accel: JoyConVector3; gyro: JoyConVector3 } {
  return {
    accel: {
      x: readInt16LE(view, offset) * ACCEL_COEFFICIENT,
      y: readInt16LE(view, offset + 2) * ACCEL_COEFFICIENT,
      z: readInt16LE(view, offset + 4) * ACCEL_COEFFICIENT,
    },
    gyro: {
      x: readInt16LE(view, offset + 6) * GYRO_COEFFICIENT,
      y: readInt16LE(view, offset + 8) * GYRO_COEFFICIENT,
      z: readInt16LE(view, offset + 10) * GYRO_COEFFICIENT,
    },
  };
}

export class JoyCon extends EventTarget {
  readonly device: HIDDevice;
  readonly side: JoyConSide;
  private packetNumber = 0;

  constructor(device: HIDDevice) {
    super();
    this.device = device;
    this.side = device.productId === JOYCON_L_PRODUCT_ID ? "left" : "right";
  }

  static isJoyCon(device: HIDDevice): boolean {
    return (
      device.vendorId === NINTENDO_VENDOR_ID &&
      (device.productId === JOYCON_L_PRODUCT_ID || device.productId === JOYCON_R_PRODUCT_ID)
    );
  }

  async open(): Promise<void> {
    if (!this.device.opened) {
      await this.device.open();
    }
    this.device.addEventListener("inputreport", this.handleInputReport);
    await this.sendSubcommand(SUBCOMMAND.SET_INPUT_REPORT_MODE, [STANDARD_FULL_REPORT_ID]);
    // Bluetooth経由だと連続送信した2つ目のサブコマンドが無視されることがあるため間隔を空ける
    await sleep(150);
    await this.sendSubcommand(SUBCOMMAND.ENABLE_IMU, [0x01]);
  }

  async close(): Promise<void> {
    this.device.removeEventListener("inputreport", this.handleInputReport);
    if (this.device.opened) {
      await this.device.close();
    }
  }

  onState(listener: (state: JoyConState) => void): () => void {
    const handler = (event: Event) => listener((event as CustomEvent<JoyConState>).detail);
    this.addEventListener("state", handler);
    return () => this.removeEventListener("state", handler);
  }

  private async sendSubcommand(subcommand: number, args: number[]): Promise<void> {
    const neutralRumble = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40];
    const data = new Uint8Array([this.packetNumber & 0x0f, ...neutralRumble, subcommand, ...args]);
    this.packetNumber += 1;
    await this.device.sendReport(OUTPUT_REPORT_ID, data);
  }

  private handleInputReport = (event: HIDInputReportEvent): void => {
    if (event.reportId !== STANDARD_FULL_REPORT_ID) return;

    const state: JoyConState = {
      buttons: parseButtons(event.data, this.side),
      ...parseImuSample(event.data, IMU_FIRST_SAMPLE_OFFSET),
    };

    this.dispatchEvent(new CustomEvent("state", { detail: state }));
  };
}

export async function requestJoyCon(): Promise<JoyCon> {
  const devices = await navigator.hid.requestDevice({
    filters: [
      { vendorId: NINTENDO_VENDOR_ID, productId: JOYCON_L_PRODUCT_ID },
      { vendorId: NINTENDO_VENDOR_ID, productId: JOYCON_R_PRODUCT_ID },
    ],
  });

  const device = devices.find(JoyCon.isJoyCon);
  if (!device) {
    throw new Error("Joy-Conが選択されませんでした");
  }

  const joyCon = new JoyCon(device);
  await joyCon.open();
  return joyCon;
}

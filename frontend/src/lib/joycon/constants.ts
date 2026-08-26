export const NINTENDO_VENDOR_ID = 0x057e

export const JOYCON_L_PRODUCT_ID = 0x2006
export const JOYCON_R_PRODUCT_ID = 0x2007

export const OUTPUT_REPORT_ID = 0x01

export const SUBCOMMAND = {
  SET_INPUT_REPORT_MODE: 0x03,
  ENABLE_IMU: 0x40,
} as const

// 入力レポートモード 0x30 を要求すると、以後の入力レポートは report id 0x30 で届く
export const STANDARD_FULL_REPORT_ID = 0x30

export const ACCEL_COEFFICIENT = 0.000244 // raw -> G (±8G レンジ)
export const GYRO_COEFFICIENT = 0.07 // raw -> deg/s (±2000dps レンジ)

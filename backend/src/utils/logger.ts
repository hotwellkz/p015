export class Logger {
  static info(message: string, ...meta: unknown[]) {
    console.log(message, ...meta);
  }

  static warn(message: string, ...meta: unknown[]) {
    console.warn(message, ...meta);
  }

  static error(message: string, ...meta: unknown[]) {
    console.error(message, ...meta);
  }
}








declare module "canvas" {
  export function createCanvas(
    width: number,
    height: number,
  ): {
    getContext(type: "2d"): unknown;
    toBuffer(mime: string): Buffer;
  };
}

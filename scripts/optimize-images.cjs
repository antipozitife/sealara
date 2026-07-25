const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const imageDir = path.resolve(__dirname, "../src/images");
const images = ["seal-happy", "seal-reading", "seal-sad", "seal-thinking", "seal-wave"];

const optimize = async () => {
  await Promise.all(
    images.map(async (name) => {
      const input = path.join(imageDir, `${name}.png`);
      const output = path.join(imageDir, `${name}.webp`);
      await sharp(input).webp({ quality: 84, alphaQuality: 90, effort: 6 }).toFile(output);
    }),
  );

  const sizes = await Promise.all(
    images.map(async (name) => {
      const source = await fs.stat(path.join(imageDir, `${name}.png`));
      const optimized = await fs.stat(path.join(imageDir, `${name}.webp`));
      return `${name}: ${Math.round(source.size / 1024)} KB → ${Math.round(optimized.size / 1024)} KB`;
    }),
  );

  console.log(sizes.join("\n"));
};

optimize().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY: string = process.env.PRIVATE_KEY as string;

export {
  PRIVATE_KEY,
};
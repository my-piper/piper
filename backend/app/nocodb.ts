import axios from "axios";
import { NOCODB_XC_TOKEN } from "../consts/nocodb";

export default axios.create({
  baseURL: "https://app.nocodb.com/api/v2/",
  headers: {
    "xc-token": NOCODB_XC_TOKEN,
  },
});

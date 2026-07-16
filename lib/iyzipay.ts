import Iyzipay from "iyzipay";

// .env.local dosyasındaki şifreleri alarak İyzico sistemine bağlanıyoruz
const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY || "",
  secretKey: process.env.IYZICO_SECRET_KEY || "",
  uri: process.env.IYZICO_URI || "https://sandbox-api.iyzipay.com"
});

export default iyzipay;
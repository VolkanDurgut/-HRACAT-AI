import { NextResponse } from "next/server";
import iyzipay from "@/lib/iyzipay";

export async function POST(req: Request) {
  try {
    // 1. Frontend'den gelen form verilerini okuyoruz
    const body = await req.json();
    const { faturaTipi, unvan, vergiDairesi, vkn, adSoyad, tckn, adres, kartIsim, kartNo, skt, cvc } = body;

    // 2. Kartın Son Kullanma Tarihini (AA/YY) İyzico'nun istediği formata (Ay ve Yıl) ayırıyoruz
    const [expireMonth, expireYear] = skt.split("/");

    // 3. Fatura tipine göre alıcı (Buyer) bilgilerini dinamik ayarlıyoruz
    const buyerName = faturaTipi === "bireysel" ? adSoyad.split(" ")[0] : unvan.substring(0, 15);
    const buyerSurname = faturaTipi === "bireysel" ? adSoyad.split(" ").slice(1).join(" ") || "Soyad" : "AS";
    const identityNumber = faturaTipi === "bireysel" ? tckn : (vkn || "11111111111");

    // 4. İyzico'ya gönderilecek işlem paketi (Test için 1 TL'lik sanal çekim)
    const request = {
      locale: "tr",
      conversationId: "IHRACAT-AI-TRIAL-" + Date.now(),
      price: "1.0",
      paidPrice: "1.0",
      currency: "TRY",
      installment: "1",
      basketId: "TRIAL-BASKET",
      paymentChannel: "WEB",
      paymentGroup: "SUBSCRIPTION",
      paymentCard: {
        cardHolderName: kartIsim,
        cardNumber: kartNo.replace(/\s+/g, ''), // Kart numarasındaki boşlukları temizler
        expireMonth: expireMonth,
        expireYear: "20" + expireYear, // Örn: 26 -> 2026
        cvc: cvc,
        registerCard: "0"
      },
      buyer: {
        id: "BY-" + Date.now(),
        name: buyerName,
        surname: buyerSurname,
        gsmNumber: "+905320000000",
        email: "test@ihracatai.com",
        identityNumber: identityNumber,
        registrationAddress: adres,
        ip: "85.34.78.112",
        city: "Istanbul",
        country: "Turkey",
        zipCode: "34000"
      },
      shippingAddress: {
        contactName: kartIsim,
        city: "Istanbul",
        country: "Turkey",
        address: adres,
        zipCode: "34000"
      },
      billingAddress: {
        contactName: kartIsim,
        city: "Istanbul",
        country: "Turkey",
        address: adres,
        zipCode: "34000"
      },
      basketItems: [
        {
          id: "PRO-TRIAL",
          name: "İhracat AI - 14 Günlük Deneme Başlatma",
          category1: "Software",
          itemType: "VIRTUAL",
          price: "1.0"
        }
      ]
    };

    // 5. İyzico'ya İsteği Atıyoruz
    return new Promise<NextResponse>((resolve) => {
      iyzipay.payment.create(request as any, function (err: any, result: any) {
        if (err) {
          return resolve(NextResponse.json({ success: false, message: "Ödeme altyapısına bağlanılamadı." }, { status: 500 }));
        }
        
        if (result.status === "success") {
          // TODO: Burada Supabase veritabanındaki kullanıcıyı "Denemede" olarak güncelleyeceğiz
          return resolve(NextResponse.json({ success: true, message: "Kredi kartı doğrulandı ve deneme süresi başladı!" }));
        } else {
          return resolve(NextResponse.json({ success: false, message: result.errorMessage }, { status: 400 }));
        }
      });
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, message: "Bir sunucu hatası oluştu." }, { status: 500 });
  }
}
// app/flags-test/page.tsx
import StoreFeedback from "@/components/StoreFeedback";

export default function FlagsTestPage() {
  // ★ここは一旦、Supabase の Table Editor から
  //   stores の1件目の id（uuid）と、products の1件目の id（数字）をコピペしてテストすると早いです。
  const storeId = "0d3e6e98-cc8e-4c2f-a2b6-b722f42ec735";
  const productId = 1; // ここに products.id（例：1）を入れる

  return (
    <main className="max-w-xl mx-auto p-4">
      <h1 className="text-lg font-semibold mb-4">
        フラグ投稿テスト（flags-test）
      </h1>

      <StoreFeedback
        storeId={storeId}
        storeName="テスト店舗"
        productId={productId}
      />
    </main>
  );
}

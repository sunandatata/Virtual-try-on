export const completeProductPage = `
  <title>Fallback title</title>
  <meta property="og:site_name" content="Example Boutique">
  <main data-product>
    <h1>Nearby heading</h1>
    <img id="garment" src="https://shop.example/dress.jpg" alt="Blue dress">
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Structured Linen Dress","image":"https://shop.example/dress.jpg","color":"Ocean Blue","offers":{"@type":"Offer","price":"79.00","priceCurrency":"USD"}}
    </script>
  </main>`;

export const partialProductPage = `
  <title>Summer Blouse | Example</title>
  <meta property="og:title" content="Summer Blouse">
  <article>
    <img id="garment" src="https://shop.example/blouse.jpg" alt="Ivory blouse">
    <p class="price">$42.00</p>
  </article>`;

export const multiplePriceProductPage = `
  <title>Sale page</title>
  <section>
    <h2>Evening Dress</h2>
    <img id="garment" src="https://shop.example/evening.jpg" alt="Evening dress">
    <span class="price">$120.00</span><span class="price">$85.00</span>
  </section>`;

export const noMetadataProductPage = `
  <img id="garment" src="https://shop.example/plain.jpg" alt="">
`;

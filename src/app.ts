import { chromium } from "playwright";

enum ProductAvailabilityType {
    AVAILABLE,
    LIMITED,
    UNAVAILABLE,
    PRE_ORDER,
}

interface ProductAvailability {
    availability: ProductAvailabilityType;
    itemsLeftOnStock?: number;
    estimatedDeliveryDays?: number;
}

interface Product {
    title: string;
    url?: string;
    availability?: ProductAvailability;
    oldPrice?: number;
    price: number;
}

const CATEGORIES = [
    "telefoane-mobile",
    "televizoare",
    "laptopuri",
    "smartwatch",
];

const getProductAvailability = (stockInfo: string) : ProductAvailability => {
    if (stockInfo == null) {
        return null;
    }
   
    stockInfo = stockInfo.toLowerCase().replace('ă', 'a').replace('â', 'a').replace('î', 'i').replace('ș', 's').replace('ț', 't')
    if (stockInfo === 'instoc') {
        return {
            availability: ProductAvailabilityType.AVAILABLE
        }
    }

    if (stockInfo === 'indisponibil') {
        return {
            availability: ProductAvailabilityType.UNAVAILABLE
        }
    }

    if (stockInfo.startsWith('livrarein')) {
        return {
            availability: ProductAvailabilityType.AVAILABLE,
            estimatedDeliveryDays: parseInt(stockInfo.replace('livrarein', '').replace('zile', ''))
        }
    }

    if (stockInfo.startsWith('ultimele')) {
        return {
            availability: ProductAvailabilityType.AVAILABLE,
            itemsLeftOnStock: parseInt(stockInfo.replace('ultimele', '').replace('produse', ''))
        }
    }

    if (stockInfo === 'ultimulprodusinstoc') {
        return {
            availability: ProductAvailabilityType.AVAILABLE,
            itemsLeftOnStock: 1
        }
    }

    if (stockInfo === 'stoclimitat') {
        return {
            availability: ProductAvailabilityType.LIMITED
        }
    }

    if (stockInfo.startsWith('precomanda')) {
        return {
            availability: ProductAvailabilityType.PRE_ORDER
        }
    }

    return null
}

const getProductsFromCategory = async (category: string): Promise<any> => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    const navigationPromise = page.waitForNavigation();

    await page.goto(resolveCategoryProductsLink(category));
    await page.setViewportSize({ width: 1278, height: 1287 });
    await navigationPromise;

    // Identify the number of products on page and number of total products in category\
    // Total number of products in category
    const totalProductsHandler = await page.waitForSelector(
        ".listing-panel > .listing-panel-footer > .row > .col-lg-3 > .control-label"
    );
    const productsPaginationText = await totalProductsHandler.innerText();

    // tslint:disable-next-line:radix
    const totalProducts = parseInt(
        productsPaginationText
            .substring(productsPaginationText.indexOf("din") + 4)
            .replace("de produse", "")
            .replace(" ", "")
    );
    console.log(`Total products for category ${category} is ${totalProducts}`);

    const [currentPageStart, currentPageEnd] = productsPaginationText
        .substring(0, productsPaginationText.indexOf("din"))
        .split("-")
        .map((str) => parseInt(str, 10));

    const currentPageSize = currentPageEnd - currentPageStart + 1;
    console.log(
        `Current page start ${currentPageStart}, current page end ${currentPageEnd}, current page size ${currentPageSize}`
    );

    const isFirstPage: boolean = currentPageStart === 1;
    const isLastPage: boolean = currentPageEnd === totalProducts;

    const products: Product[] = [];

    let productIndex = 1;
    while (
        products.length < currentPageSize &&
        productIndex <= 1.1 * currentPageEnd
    ) {
        // abatere 10%

        try {
            // const productTitleHandler = await page.waitForSelector(
            //     `.card-item:nth-child(${productIndex}) > .card > .card-section-wrapper > .card-section-mid > .card-body`,
            //     { timeout: 50 }
            // );
            // const productTitle = await productTitleHandler.innerText();
            
            // TODO: De vazut care dintre metodele pentru titlu este mai performanta

            const productTitleHandler = await page.waitForSelector(
                `.card-item:nth-child(${productIndex})`
            );

            const productTitle = await productTitleHandler.getAttribute('data-name')

            
            const productUrlHandler = await (await page.waitForSelector(`.card-item:nth-child(${productIndex}) > .card > .card-section-wrapper > .card-section-top`)).waitForSelector(`.js-product-url`)

            const productUrl = await productUrlHandler.getAttribute('href')

            const oldPriceHandler = await page.waitForSelector(
                `.card-item:nth-child(${productIndex}) > .card > .card-section-wrapper > .card-section-btm > .card-body > .pricing-old_preserve-space > .product-old-price`
            );
            const oldPriceStr = await oldPriceHandler.innerText();

            const oldPrice =
                oldPriceStr == null || oldPriceStr.trim() === ""
                    ? null
                    : parseFloat(
                          oldPriceStr
                              .substring(0, oldPriceStr.indexOf("Lei"))
                              .toLowerCase()
                              .replace("lei", "")
                              .replace(".", "")
                      ) / 100;

            const priceHandler = await page.waitForSelector(
                `.card-item:nth-child(${productIndex}) > .card > .card-section-wrapper > .card-section-btm > .card-body > .pricing-old_preserve-space > .product-new-price`
            );
            const priceStr: string = await priceHandler.innerText();
            const price =
                parseFloat(
                    priceStr
                        .toLowerCase()
                        .toLowerCase()
                        .replace("lei", "")
                        .replace(".", "")
                ) / 100;

            const productAvailabilityHandler = await page.waitForSelector(`.card-item:nth-child(${productIndex}) > .card > .card-section-wrapper > .card-section-btm > .card-body > .product-stock-status`)
            const productAvailability = getProductAvailability(await productAvailabilityHandler.innerText())

            products.push({
                title: productTitle,
                price,
                oldPrice,
                url: productUrl,
                availability: productAvailability
            });
            // console.log('Scanned product: ' + productTitle)
        } catch (ex) {
            console.error(category + " -> skipping for index " + productIndex + ", ex: ", ex);
        }
        productIndex++;
    }

    console.log(`Found ${products.length} products for ${category}`);
    console.log(`${category} products: `);
    console.log(JSON.stringify(products));

    // Select first product's title

    // console.log('')
    /*
    await page.waitForSelector('.card-item:nth-child(13) > .card > .card-section-wrapper > .card-section-mid > .card-body')
    await page.click('.card-item:nth-child(13) > .card > .card-section-wrapper > .card-section-mid > .card-body')

    await page.waitForSelector('.card-item:nth-child(15) > .card > .card-section-wrapper > .card-section-mid > .card-body')
    await page.click('.card-item:nth-child(15) > .card > .card-section-wrapper > .card-section-mid > .card-body')


    await page.waitForSelector('.card-item:nth-child(1) > .card > .card-section-wrapper > .card-section-btm > .card-body > .product-stock-status')
    await page.click('.card-item:nth-child(1) > .card > .card-section-wrapper > .card-section-btm > .card-body > .product-stock-status')

    await page.waitForSelector('.card-item:nth-child(1) > .card > .card-section-wrapper > .card-section-btm > .card-body > .pricing-old_preserve-space > .product-old-price')
    await page.click('.card-item:nth-child(1) > .card > .card-section-wrapper > .card-section-btm > .card-body > .pricing-old_preserve-space > .product-old-price')

    await page.waitForSelector('.card-item:nth-child(1) > .card > .card-section-wrapper > .card-section-btm > .card-body > .pricing-old_preserve-space > .product-new-price')
    await page.click('.card-item:nth-child(1) > .card > .card-section-wrapper > .card-section-btm > .card-body > .pricing-old_preserve-space > .product-new-price')

    await page.waitForSelector('.container > .clearfix > .page-container > #card_grid > .card-item:nth-child(2)')
    await page.click('.container > .clearfix > .page-container > #card_grid > .card-item:nth-child(2)')
    */
    await browser.close();
};

const resolveCategoryProductsLink = (category: string) => {
    return `https://www.emag.ro/${category}/c`;
};

(async () => {
    const startTime = Date.now();

    const promises = CATEGORIES.map((category) =>
        getProductsFromCategory(category)
    );
    await Promise.all(promises);
    const timeEffortInMillis = Date.now() - startTime;
    console.log(`Time effort:  ${timeEffortInMillis} millis`);
})();

import { chromium, ChromiumBrowser, ChromiumBrowserContext, Page } from "playwright";

enum ProductAvailabilityType {
    AVAILABLE = "AVAILABLE",
    LIMITED = "LIMITED",
    UNAVAILABLE = "UNAVAILABLE",
    PRE_ORDER = "PRE_ORDER",
}

interface ProductStockInfo {
    availability: ProductAvailabilityType;
    itemsLeftOnStock?: number;
    estimatedDeliveryDays?: number;
}

interface Product {
    title: string;
    url: string;
    stockInfo?: ProductStockInfo;
    oldPrice?: number;
    price: number;
}


const getProductStockInfo = (stockInfoStr: string): ProductStockInfo => {
    if (stockInfoStr == null) {
        return null;
    }

    const DIACRITICS = ['ă', 'â', 'î', 'ș', 'ț'];

    stockInfoStr = stockInfoStr.trim().toLowerCase().replace(/ă/g, 'a').replace(/â/g, 'a').replace(/î/g, 'i').replace(/ș/g, 's').replace(/ț/g, 't').replace(/ /g, '_')
    if (stockInfoStr === 'in_stoc' || stockInfoStr === 'in_stoc_furnizor') {
        return {
            availability: ProductAvailabilityType.AVAILABLE
        }
    }

    if (stockInfoStr === 'indisponibil' || stockInfoStr === 'stoc_epuizat') {
        return {
            availability: ProductAvailabilityType.UNAVAILABLE
        }
    }

    if (stockInfoStr.startsWith('livrare_in')) {
        return {
            availability: ProductAvailabilityType.AVAILABLE,
            estimatedDeliveryDays: parseInt(stockInfoStr.replace('livrarein', '').replace('zile', ''))
        }
    }

    if (stockInfoStr.startsWith('ultimele')) {
        return {
            availability: ProductAvailabilityType.AVAILABLE,
            itemsLeftOnStock: parseInt(stockInfoStr.replace('ultimele', '').replace('produse', ''))
        }
    }

    if (stockInfoStr === 'ultimul_produs_in_stoc') {
        return {
            availability: ProductAvailabilityType.AVAILABLE,
            itemsLeftOnStock: 1
        }
    }

    if (stockInfoStr === 'stoc_limitat') {
        return {
            availability: ProductAvailabilityType.LIMITED
        }
    }

    if (stockInfoStr.startsWith('precomanda')) {
        return {
            availability: ProductAvailabilityType.PRE_ORDER
        }
    }

    console.error('Can not interpret stockInfo: ' + stockInfoStr)
    return null
}

const getProductsFromCategory = async (category: string): Promise<any> => {


    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    const navigationPromise = page.waitForNavigation();

    // Navigate to the first page of the category
    await page.goto(resolveCategoryProductsLink(category, 1));
    await page.setViewportSize({ width: 1278, height: 1287 });
    await navigationPromise

    // determine the total number of pages
    // Total number of products in category
    const totalNumberOfProducts = await getTotalNumberOfProducts(page);

    console.log(`Total products for category ${category} is ${totalNumberOfProducts}`);

    const firstPageInfo = await getCurrentPagePaginationInfo(page);

    const noPages = totalNumberOfProducts / firstPageInfo.pageSize + (totalNumberOfProducts % firstPageInfo.pageSize != 0 ? 1 : 0)


    let products: Product[] = []

    for (let pageIndex = 1; pageIndex <= noPages; pageIndex++) {
        // TODO: Navigate to the pageIndex page
        await page.goto(resolveCategoryProductsLink(category, pageIndex))
        await navigationPromise

        // const paginationInfo = await getCurrentPagePaginationInfo(page);

        const productsPage = await extractProductsFromPage(page, category, pageIndex);
        products = products.concat(productsPage)
    }

    console.log(`Identified ${products.length} products in total for category ${category}`)

    await page.close();
    await browser.close();
}

/**
 * Extracts the total number of products from the specified page.
 * @param page The browser's products page.
 */
const getTotalNumberOfProducts = async (page: Page): Promise<number> => {
    const productsPaginationTextHandler = await page.waitForSelector(
        ".listing-panel > .listing-panel-footer > .row > .col-lg-3 > .control-label"
    );

    const productsPaginationText = await productsPaginationTextHandler.innerText();

    // tslint:disable-next-line:radix
    return parseInt(
        productsPaginationText
            .substring(productsPaginationText.indexOf("din") + 4)
            .replace("de produse", "")
            .replace(" ", "")
    );
}

const getCurrentPagePaginationInfo = async (page: Page): Promise<any> => {
    const productsPaginationTextHandler = await page.waitForSelector(
        ".listing-panel > .listing-panel-footer > .row > .col-lg-3 > .control-label"
    );

    const productsPaginationText = await productsPaginationTextHandler.innerText();

    const [currentPageStart, currentPageEnd] = productsPaginationText
        .substring(0, productsPaginationText.indexOf("din"))
        .split("-")
        .map((str) => parseInt(str, 10));

    const pageSize = currentPageEnd - currentPageStart + 1;

    return { currentPageStart, currentPageEnd, pageSize }
}

const extractProductsFromPage = async (
    page: Page,
    category: string,
    pageIndex?: number
): Promise<Product[]> => {

    if (pageIndex == null || pageIndex < 1) {
        pageIndex = 1;
    }

    // const browser = await chromium.launch({ headless: false });
    // const context = await browser.newContext();
    // const page = await context.newPage();

    // const navigationPromise = page.waitForNavigation();

    // await page.goto(resolveCategoryProductsLink(category, pageIndex));
    // await page.setViewportSize({ width: 1278, height: 1287 });
    // await navigationPromise;

    // Identify the number of products on page and number of total products in category\
    // Total number of products in category
    const productsPaginationTextHandler = await page.waitForSelector(
        ".listing-panel > .listing-panel-footer > .row > .col-lg-3 > .control-label"
    );
    const productsPaginationText = await productsPaginationTextHandler.innerText();

    // // tslint:disable-next-line:radix
    // const totalProducts = parseInt(
    //     productsPaginationText
    //         .substring(productsPaginationText.indexOf("din") + 4)
    //         .replace("de produse", "")
    //         .replace(" ", "")
    // );
    // console.log(`Total products for category ${category} is ${totalProducts}`);

    const paginationInfo = await getCurrentPagePaginationInfo(page);

    // const isFirstPage: boolean = currentPageStart === 1;
    // const isLastPage: boolean = currentPageEnd === totalProducts;

    const products: Product[] = [];

    let productIndex = 1;
    let skipped = 0;
    while (
        products.length < paginationInfo.pageSize &&
        productIndex <= 1.05 * paginationInfo.currentPageEnd
    ) {
        // abatere 10%

        try {
            // const productTitleHandler = await page.waitForSelector(
            //     `.card-item:nth-child(${productIndex}) > .card > .card-section-wrapper > .card-section-mid > .card-body`,
            //     { timeout: 50 }
            // );
            // const productTitle = await productTitleHandler.innerText();

            // TODO: De vazut care dintre metodele pentru titlu este mai performanta

            const productCardHandler = await page.waitForSelector(
                `.card-item:nth-child(${productIndex})`, { timeout: 50 }
            );

            const productTitle = await productCardHandler.getAttribute('data-name')

            const cardSectionWrapper = await productCardHandler.waitForSelector(`.card > .card-section-wrapper`, { timeout: 50 })

            const productUrlHandler = await cardSectionWrapper.waitForSelector(`.js-product-url`)

            const productUrl = await productUrlHandler.getAttribute('href')

            const oldPriceHandler = await cardSectionWrapper.waitForSelector(`.card-section-btm > .card-body > .pricing-old_preserve-space > .product-old-price`)
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

            const priceHandler = await cardSectionWrapper.waitForSelector(
                `.card-section-btm > .card-body > .pricing-old_preserve-space > .product-new-price`
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

            const productAvailabilityHandler = await cardSectionWrapper.waitForSelector(`.card-section-btm > .card-body > .product-stock-status`)
            const productAvailability = getProductStockInfo(await productAvailabilityHandler.innerText())

            products.push({
                title: productTitle,
                price,
                oldPrice,
                url: productUrl,
                stockInfo: productAvailability
            });
            // console.log('Scanned product: ' + productTitle)
        } catch (ex) {
            // console.error(category + " -> skipping for index " + productIndex + ", ex: ", ex);
            skipped++
        }
        productIndex++;
    }

    console.log(`\n\nCategory ${category} page ${pageIndex}`)
    console.log(`   -> found ${products.length} products`);
    console.log(`   -> skipped ${skipped} html elements`)

    return products
    // console.log(`${category} products: `);
    // console.log(JSON.stringify(products));

    // await page.close()
    // await browser.close();
};

const resolveCategoryProductsLink = (category: string, pageIndex?: number) => {
    const baseUrl = 'https://www.emag.ro'
    return pageIndex == null ? `${baseUrl}/${category}/c` :
        `${baseUrl}/${category}/p${pageIndex}/c`
        ;
};

(async () => {

    const CATEGORIES = [
        "telefoane-mobile",
        // "tablete",
        // "televizoare",
        // "laptopuri",
        // "smartwatch",
        // "desktop-pc",
        // "placi_video",
        // "placi_baza",
        // "memorii",
        // "procesoare",
        // "solid-state_drive_ssd_",
        // "hard_disk-uri",
        // "hard_disk-uri"
    ];

    const startTime = Date.now();

    let QUEUE = []
    for (let category of CATEGORIES) {
        if (QUEUE.length === 5) {
            const promises = QUEUE.map((category) =>
                getProductsFromCategory(category)
            );
            await Promise.all(promises)
            QUEUE = []
        } else {
            QUEUE.push(category)
        }

    }

    if (QUEUE.length > 0) {
        const promises = QUEUE.map((category) =>
            getProductsFromCategory(category)
        );
        await Promise.all(promises)
    }

    const timeEffortInMillis = Date.now() - startTime;
    console.log(`Time effort:  ${timeEffortInMillis} millis`);
})();

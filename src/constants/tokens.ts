export interface Token {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logo: string;
    supplied?: string;
    borrowed?: string;
}

export const TOKENS: Token[] = [
    {
        address: '0x0000000000000000000000000000000000000000', // Native BNB placeholder
        symbol: 'BNB',
        name: 'Binance Coin',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1839.png',
    },
    {
        address: '0x55d398326f99059fF775485246999027B3197955',
        symbol: 'USDT',
        name: 'Tether',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png',
    },
    {
        address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png',
    },
    {
        address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
    },
    {
        address: '0x0cBD6fAdcF8096cC9A43d90B45F65826102e3eCE',
        symbol: 'CDT',
        name: 'CheckDot',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/8935.png',
    },
];

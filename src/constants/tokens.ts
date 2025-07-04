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
        address: '0x0000000000000000000000000000000000000000', // Native ETH placeholder
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
    },
    {
        address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDT
        symbol: 'USDT',
        name: 'Tether',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png',
    },
    {
        address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png',
    },
    {
        address: '0xfFF9976782d46CC05630D1F6EbAB18B2324d6b14', // Sepolia WETH
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
    },
    {
        address: '0x0000000000000000000000000000000000000000', // Remove or replace with a Sepolia token if needed
        symbol: 'SEP',
        name: 'Sepolia Token',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/8935.png',
    },
];

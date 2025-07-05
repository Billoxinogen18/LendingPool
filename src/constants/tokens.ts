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
        address: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', // Sepolia USDT
        symbol: 'USDT',
        name: 'Tether',
        decimals: 6,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png',
    },
    {
        address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png',
    },
    {
        address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // Sepolia WETH
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
    },
    // Add more tokens here as needed
];

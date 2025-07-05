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
        address: '0xd9c3d94c64ab6d1ccb30d9c2e6c774fa9a1ab6f6', // Example Sepolia USDT (dummy)
        symbol: 'USDT',
        name: 'Tether',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png',
    },
    {
        address: '0x07865c6e87b9f70255377e024ace6630c1eaa37f', // Sepolia USDC (Chainlink testnet feed token)
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png',
    },
    {
        address: '0xdd13e55209fd76afe204d3f63c10e206b4c7cbbc', // Sepolia WETH (Chainlink)
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
    },
    // Add more tokens here as needed
];

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LendingPoolTest is Ownable, ReentrancyGuard {
    struct Collateral {
        uint256 amount;
    }

    struct TokenConfig {
        uint256 weight;
        bool isActive;
    }

    address public constant NATIVE_BNB = address(0);
    address public constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address public constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address public constant USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address public constant WETH = 0x2170Ed0880ac9A755fd29B2688956BD959F933F8;
    address public constant CDT = 0x0cBD6fAdcF8096cC9A43d90B45F65826102e3eCE;

    address public constant WBNB_USDT_PAIR = 0x4c2B1F4de009B58498B8b66e10A231A1B233277E;
    address public constant WETH_USDT_PAIR = 0xBe141893E4c6AD9272e8C04BAB7E6a10604501a5;
    address public constant CDT_WBNB_PAIR = 0xf8104aAa719D31ea25dC494576593c10a8f929E6;

    uint256 public constant MAX_BORROW_RATIO = 80;
    uint256 public constant LIQUIDATION_THRESHOLD = 80;
    uint256 private constant PRECISION = 1e18;

    mapping(address => mapping(address => Collateral)) public userCollateral;
    mapping(address => mapping(address => uint256)) public userDebt;
    mapping(address => TokenConfig) public tokenConfigs;
    mapping(address => uint256) public reserves;
    address[] public supportedTokens;

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event Borrowed(address indexed user, address indexed token, uint256 amount);
    event Repaid(address indexed user, address indexed token, uint256 amount);
    event Liquidated(address indexed user, uint256 totalDebtUSD, address[] tokens, uint256[] amounts);
    event TokenAdded(address indexed token, uint256 weight);
    event PoolFunded(address indexed user, address indexed token, uint256 amount);
    event PoolFundsWithdrawn(address indexed owner, address indexed token, uint256 amount);

    constructor() Ownable() {
        _addToken(USDT, 100);
        _addToken(NATIVE_BNB, 70);
        _addToken(USDC, 100);
        _addToken(WETH, 70);
        _addToken(CDT, 50);
    }

    function _addToken(address token, uint256 weight) public onlyOwner {
        require(weight > 0 && weight <= 100, "Invalid weight");
        require(tokenConfigs[token].weight == 0, "Token exists");
        tokenConfigs[token] = TokenConfig(weight, true);
        supportedTokens.push(token);
        emit TokenAdded(token, weight);
    }

    function deposit(address token, uint256 amount) external payable nonReentrant {
        _ensureTokenSupported(token);
        require(amount > 0, "Amount = 0");

        _transferIn(token, msg.sender, amount);
        userCollateral[msg.sender][token].amount += amount;

        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        _ensureTokenSupported(token);
        require(amount > 0, "Amount = 0");
        require(userCollateral[msg.sender][token].amount >= amount, "Low collateral");

        uint256 withdrawUSD = (amount * getTokenPrice(token)) / PRECISION;
        uint256 totalDebt = getTotalDebtUSD(msg.sender);
        uint256 capacity = getBorrowCapacity(msg.sender);
        require(capacity >= withdrawUSD, "Exceeds capacity");
        require(capacity - withdrawUSD >= (totalDebt * 100) / MAX_BORROW_RATIO, "Exceeds LTV");

        userCollateral[msg.sender][token].amount -= amount;
        _transferOut(token, msg.sender, amount);

        emit Withdrawn(msg.sender, token, amount);
    }

    function borrow(address token, uint256 amount) external payable nonReentrant {
        _ensureTokenSupported(token);
        require(amount > 0, "Amount = 0");
        require(reserves[token] >= amount, "Low reserve");

        uint256 borrowUSD = (amount * getTokenPrice(token)) / PRECISION;
        uint256 userCapacity = getBorrowCapacity(msg.sender);
        uint256 currentDebt = getTotalDebtUSD(msg.sender);

        require(currentDebt + borrowUSD <= (userCapacity * MAX_BORROW_RATIO) / 100, "Exceeds limit");

        userDebt[msg.sender][token] += amount;
        reserves[token] -= amount;
        _transferOut(token, msg.sender, amount);

        emit Borrowed(msg.sender, token, amount);
    }

    function repay(address token, uint256 amount) external payable nonReentrant {
        _ensureTokenSupported(token);
        require(amount > 0, "Amount = 0");
        require(userDebt[msg.sender][token] >= amount, "Too much");

        _transferIn(token, msg.sender, amount);
        userDebt[msg.sender][token] -= amount;
        reserves[token] += amount;

        emit Repaid(msg.sender, token, amount);
    }

    function liquidate(address user) external nonReentrant {
        uint256 totalDebtUSD = getTotalDebtUSD(user);
        require(totalDebtUSD > 0, "No debt");
        require(getIndebtedness(user) > LIQUIDATION_THRESHOLD, "Healthy");

        address[] memory tokens = new address[](supportedTokens.length);
        uint256[] memory amounts = new uint256[](supportedTokens.length);
        uint256 totalCollateralUSD = 0;
        uint256 count = 0;

        for (uint256 i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            uint256 amt = userCollateral[user][token].amount;
            if (amt > 0) {
                totalCollateralUSD += (amt * getTokenPrice(token)) / PRECISION;
                reserves[token] += amt;
                userCollateral[user][token].amount = 0;
                tokens[count] = token;
                amounts[count] = amt;
                count++;
            }
            userDebt[user][token] = 0;
        }

        require(totalCollateralUSD >= totalDebtUSD, "Shortfall");

        uint256 surplus = totalCollateralUSD - totalDebtUSD;
        if (surplus > 0) {
            uint256 cdtPrice = getTokenPrice(CDT);
            uint256 cdtAmt = (surplus * PRECISION) / cdtPrice;
            if (reserves[CDT] >= cdtAmt) {
                userCollateral[user][CDT].amount += cdtAmt;
                reserves[CDT] -= cdtAmt;
            }
        }

        assembly {
            mstore(tokens, count)
            mstore(amounts, count)
        }

        emit Liquidated(user, totalDebtUSD, tokens, amounts);
    }

    function getTokenPrice(address token) public view returns (uint256) {
        if (block.chainid == 97 || block.chainid == 11155111) {
            // On BSC Testnet or Sepolia, return a fixed price for any token to avoid dependency on mainnet pairs
            return 1e18; // 1 USD
        }
        _ensureTokenSupported(token);

        if (token == USDT || token == USDC) return PRECISION;

        if (token == NATIVE_BNB || token == WBNB) {
            return _getPairPrice(WBNB_USDT_PAIR, USDT, WBNB);
        }

        if (token == WETH) {
            return _getPairPrice(WETH_USDT_PAIR, USDT, WETH);
        }

        if (token == CDT) {
            uint256 wbnbPrice = getTokenPrice(WBNB);
            uint256 wbnbBal = IERC20(WETH).balanceOf(CDT_WBNB_PAIR);
            uint256 cdtBal = IERC20(CDT).balanceOf(CDT_WBNB_PAIR);
            require(cdtBal > 0, "Zero CDT");
            return (wbnbPrice * wbnbBal) / cdtBal;
        }

        revert("No price");
    }

    function _getPairPrice(address pair, address base, address quote) internal view returns (uint256) {
        uint256 baseAmt = IERC20(base).balanceOf(pair);
        uint256 quoteAmt = IERC20(quote).balanceOf(pair);
        require(quoteAmt > 0, "Zero quote");
        return (baseAmt * PRECISION) / quoteAmt;
    }

    function getBorrowCapacity(address user) public view returns (uint256 cap) {
        for (uint i = 0; i < supportedTokens.length; i++) {
            address t = supportedTokens[i];
            uint256 a = userCollateral[user][t].amount;
            if (a > 0) {
                uint256 val = (a * getTokenPrice(t)) / PRECISION;
                cap += (val * tokenConfigs[t].weight) / 100;
            }
        }
    }

    function getTotalDebtUSD(address user) public view returns (uint256 total) {
        for (uint i = 0; i < supportedTokens.length; i++) {
            address t = supportedTokens[i];
            uint256 d = userDebt[user][t];
            if (d > 0) {
                total += (d * getTokenPrice(t)) / PRECISION;
            }
        }
    }

    function getIndebtedness(address user) public view returns (uint256) {
        uint256 cap = getBorrowCapacity(user);
        return cap == 0 ? 0 : (getTotalDebtUSD(user) * 100) / cap;
    }

    function fundPool(address token, uint256 amount) external payable nonReentrant {
        _ensureTokenSupported(token);
        require(amount > 0, "Amount = 0");

        _transferIn(token, msg.sender, amount);
        reserves[token] += amount;

        emit PoolFunded(msg.sender, token, amount);
    }

    function withdrawPoolFunds(address token, uint256 amount) external onlyOwner nonReentrant {
        _ensureTokenSupported(token);
        require(amount > 0 && reserves[token] >= amount, "Invalid");

        reserves[token] -= amount;
        _transferOut(token, owner(), amount);

        emit PoolFundsWithdrawn(owner(), token, amount);
    }

    function _transferIn(address token, address from, uint256 amount) internal {
        if (token == NATIVE_BNB) {
            require(msg.value == amount, "Invalid BNB");
        } else {
            require(msg.value == 0, "BNB not allowed");
            require(IERC20(token).transferFrom(from, address(this), amount), "ERC20 failed");
        }
    }

    function _transferOut(address token, address to, uint256 amount) internal {
        if (token == NATIVE_BNB) {
            (bool sent, ) = payable(to).call{value: amount}("");
            require(sent, "BNB fail");
        } else {
            require(IERC20(token).transfer(to, amount), "ERC20 fail");
        }
    }

    function _ensureTokenSupported(address token) internal view {
        require(tokenConfigs[token].isActive, "Unsupported token");
    }

    receive() external payable nonReentrant {
        _ensureTokenSupported(NATIVE_BNB);
        reserves[NATIVE_BNB] += msg.value;
        emit PoolFunded(msg.sender, NATIVE_BNB, msg.value);
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }
}

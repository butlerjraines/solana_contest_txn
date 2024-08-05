import { Buffer } from 'buffer';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

let config;
let provider;

async function init() {
    config = await fetchConfig();
    if (config.transactionConfirmation) {
        document.getElementById('walletSection').classList.remove('d-none');
    }
    document.getElementById('minTokens').value = config.defaultMinBalance;
    
    document.getElementById('tokenForm').addEventListener('submit', handleSubmit);
    document.getElementById('phantomConnect').addEventListener('click', () => connectAndSendTransaction('phantom'));
    document.getElementById('solflareConnect').addEventListener('click', () => connectAndSendTransaction('solflare'));
}

async function fetchConfig() {
    const response = await fetch('/config');
    return await response.json();
}

function showAlert(message, type = 'info') {
    const responseElement = document.getElementById('response');
    responseElement.innerHTML = message;
    responseElement.className = `alert alert-${type} mt-3`;
    responseElement.classList.remove('d-none');
}

async function connectAndSendTransaction(providerName) {
    showAlert('Connecting to wallet...', 'info');

    try {
        if (providerName === 'phantom') {
            provider = window.phantom?.solana;
        } else if (providerName === 'solflare') {
            provider = window.solflare;
        }

        if (!provider) {
            showAlert(`${providerName.charAt(0).toUpperCase() + providerName.slice(1)} wallet not found. Please install it.`, 'danger');
            return;
        }

        await provider.connect();
        showAlert('Wallet connected successfully!', 'success');

        const publicKey = provider.publicKey;
        const connection = new Connection(config.network);

        const balance = await connection.getBalance(publicKey);
        const requiredAmount = config.solAmount * LAMPORTS_PER_SOL;
        const estimatedFee = 5000;

        if (balance < (requiredAmount + estimatedFee)) {
            showAlert('Insufficient balance.', 'danger');
            return;
        }

        const receiverPublicKey = new PublicKey(config.receiverPublicKey);
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: receiverPublicKey,
                lamports: requiredAmount,
            })
        );

        const blockhashResponse = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhashResponse.blockhash;
        transaction.feePayer = publicKey;

        const signedTransaction = await provider.signTransaction(transaction);
        showAlert('Transaction signed. Sending...', 'info');

        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        await connection.confirmTransaction(signature, 'confirmed');

        const solscanLink = `https://solscan.io/tx/${signature}?cluster=mainnet`;
        showAlert(`Transaction successful! View on <a href="${solscanLink}" target="_blank">Solscan</a>`, 'success');
    } catch (error) {
        console.error('An error occurred:', error);
        showAlert(`An error occurred: ${error.message}`, 'danger');
    }
}

async function handleSubmit(e) {
    e.preventDefault();
    const mintAddress = document.getElementById('mintAddress').value;
    const minTokens = document.getElementById('minTokens').value;

    if (config.transactionConfirmation && !provider) {
        showAlert('Please connect your wallet first.', 'warning');
        return;
    }

    showAlert('Finding random holder...', 'info');

    try {
        const response = await fetch('/getHolder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mintAddress, minTokens })
        });

        const data = await response.json();

        if (response.ok) {
            updateResultBox(data, mintAddress);
            document.getElementById('resultBox').classList.remove('d-none');
        } else {
            showAlert(`Error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showAlert(`An error occurred: ${error.message}`, 'danger');
    }
}

function updateResultBox(data, mintAddress) {
    document.getElementById('tokenName').textContent = data.tokenName || 'N/A';
    document.getElementById('tokenSymbol').textContent = data.tokenSymbol || 'N/A';
    document.getElementById('programType').textContent = data.programType;
    document.getElementById('eligibleHolders').textContent = data.eligibleHolders;
    document.getElementById('holderAddress').textContent = data.ownerAddress;
    
    const solscanTokenUrl = `https://solscan.io/token/${mintAddress}`;
    document.getElementById('tokenNameLink').href = solscanTokenUrl;
    document.getElementById('tokenSymbolLink').href = solscanTokenUrl;
    document.getElementById('holderAddressLink').href = `https://solscan.io/account/${data.ownerAddress}`;

    const formattedBalance = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format(Math.round(data.adjustedBalance * 10) / 10);
    
    document.getElementById('tokenBalance').textContent = formattedBalance;
}

init();
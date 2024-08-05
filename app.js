require('@dotenvx/dotenvx').config()
const express = require('express');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint, getTokenMetadata } = require('@solana/spl-token');
const { Metaplex } = require('@metaplex-foundation/js');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());

const RPC_ENDPOINT = 'https://holy-greatest-flower.solana-mainnet.quiknode.pro/9d4120cc03bcef51ba442c7b91195c9393917a30/';
const connection = new Connection(RPC_ENDPOINT);
const metaplex = new Metaplex(connection);

const DEFAULT_MIN_BALANCE = process.env.DEFAULT_MIN_BALANCE || 1000000;
const TRANSACTION_CONFIRMATION = process.env.TRANSACTION_CONFIRMATION === '1';
const TRANSACTION_AMOUNT = parseFloat(process.env.TRANSACTION_AMOUNT) || 0.1;
const TRANSACTION_RECIPIENT = process.env.TRANSACTION_RECIPIENT || 'Hfz8tc8QjSXqgiyugAksdmQw9UJZCp7BruZXDRTSfdge';

function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

app.get('/', (req, res) => {
  res.render('index', { 
    defaultMinBalance: DEFAULT_MIN_BALANCE,
    transactionConfirmation: TRANSACTION_CONFIRMATION,
    transactionAmount: TRANSACTION_AMOUNT,
    transactionRecipient: TRANSACTION_RECIPIENT
  });
});

app.post('/getHolder', async (req, res) => {
  const { mintAddress, minTokens, walletKey } = req.body;

  if (!isValidSolanaAddress(mintAddress)) {
    return res.status(400).json({ error: 'Invalid Solana address format' });
  }

  try {
    let transactionSignature = null;
    if (TRANSACTION_CONFIRMATION && walletKey) {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(walletKey),
          toPubkey: new PublicKey(TRANSACTION_RECIPIENT),
          lamports: LAMPORTS_PER_SOL * TRANSACTION_AMOUNT
        })
      );

      const { blockhash } = await connection.getRecentBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(walletKey);

      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const transactionBase64 = serializedTransaction.toString('base64');

      // Send the serialized transaction back to the client for signing
      return res.json({ transactionBase64 });
    }

    const result = await getRandomTokenHolder(mintAddress, minTokens);
    res.json({ ...result, transactionSignature });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function getRandomTokenHolder(mintAddress, minTokens) {
  const mint = new PublicKey(mintAddress);
  
  // Determine the program type
  const mintAccountInfo = await connection.getAccountInfo(mint);
  const programType = mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? 'TOKEN_2022' : 'SPL_TOKEN';

  let decimals, accounts, tokenName, tokenSymbol;

  if (programType === 'SPL_TOKEN') {
    const mintInfo = await getMint(connection, mint);
    decimals = mintInfo.decimals;

    accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        { dataSize: 165 },
        { memcmp: { offset: 0, bytes: mint.toBase58() } },
      ],
    });

    // Get SPL token metadata using Metaplex
    try {
      const nft = await metaplex.nfts().findByMint({ mintAddress: mint });
      tokenName = nft.name;
      tokenSymbol = nft.symbol;
    } catch (metaplexError) {
      tokenName = "Unknown SPL Token";
      tokenSymbol = "UNK";
    }
  } else { // TOKEN_2022
    const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    decimals = mintInfo.decimals;

    accounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: mint.toBase58() } },
      ],
    });
    
    // Get Token-2022 metadata
    const metadata = await getTokenMetadata(
      connection,
      mint,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );

    if (metadata) {
      tokenName = metadata.name;
      tokenSymbol = metadata.symbol;
    } else {
      tokenName = "Unknown Token-2022";
      tokenSymbol = "UNK";
    }
  }

  const validAccounts = accounts.filter(account => {
    const rawAmount = account.account.data.readBigUInt64LE(64);
    const amount = Number(rawAmount) / (10 ** decimals);
    return amount >= minTokens;
  });

  if (validAccounts.length === 0) {
    throw new Error('No eligible token holders found.');
  }

  const randomIndex = Math.floor(Math.random() * validAccounts.length);
  const randomAccountInfo = validAccounts[randomIndex];
  
  const ownerAddress = new PublicKey(randomAccountInfo.account.data.slice(32, 64)).toBase58();
  const rawTokenBalance = randomAccountInfo.account.data.readBigUInt64LE(64);
  const adjustedBalance = Number(rawTokenBalance) / (10 ** decimals);

  return { ownerAddress,
     adjustedBalance,
      programType,
       tokenName,
        tokenSymbol,
        eligibleHolders: validAccounts.length 
    };
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
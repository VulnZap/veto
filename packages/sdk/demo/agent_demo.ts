/**
 * LangChain Agent Demo (TypeScript)
 *
 * This module demonstrates a LangChain ReAct agent powered by Gemini
 * with financial tools protected by Veto guardrails.
 */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import 'dotenv/config';

import { createAgent, tool } from 'langchain';
import { z } from 'zod';
import { Veto } from 'veto';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simulated account state
const ACCOUNT = {
    balance: 5000.0,
    currency: 'USD',
    transactions: [
        { id: 'txn_001', type: 'deposit', amount: 1000, date: '2025-12-20' },
        { id: 'txn_002', type: 'payment', amount: -50, recipient: 'coffee_shop', date: '2025-12-25' },
    ] as Array<Record<string, unknown>>,
};

// Define tools using langchain's tool helper
const makePayment = tool(
    ({ recipient, amount, currency }) => {
        ACCOUNT.balance -= amount;
        const txn = {
            id: `txn_${String(ACCOUNT.transactions.length + 1).padStart(3, '0')}`,
            type: 'payment',
            amount: -amount,
            recipient,
            currency,
            date: new Date().toISOString().split('T')[0],
        };
        ACCOUNT.transactions.push(txn);

        return JSON.stringify({
            success: true,
            transaction_id: txn.id,
            message: `Payment of ${currency} ${amount} to ${recipient} completed`,
            new_balance: ACCOUNT.balance,
        });
    },
    {
        name: 'make_payment',
        description: 'Transfer money to a recipient. Use for sending payments to people or businesses.',
        schema: z.object({
            recipient: z.string().describe('Email or account ID of the recipient'),
            amount: z.number().describe('Amount to transfer'),
            currency: z.string().describe('Currency code (e.g., USD, EUR)'),
        }),
    }
);

const payBill = tool(
    ({ biller, amount, account_number }) => {
        ACCOUNT.balance -= amount;
        const txn = {
            id: `txn_${String(ACCOUNT.transactions.length + 1).padStart(3, '0')}`,
            type: 'bill_payment',
            amount: -amount,
            biller,
            account_number,
            date: new Date().toISOString().split('T')[0],
        };
        ACCOUNT.transactions.push(txn);

        return JSON.stringify({
            success: true,
            transaction_id: txn.id,
            message: `Bill payment of $${amount} to ${biller} completed`,
            new_balance: ACCOUNT.balance,
        });
    },
    {
        name: 'pay_bill',
        description: 'Pay a utility or service bill. Use for recurring bill payments.',
        schema: z.object({
            biller: z.string().describe('Name of the billing company'),
            amount: z.number().describe('Bill amount to pay'),
            account_number: z.string().describe('Your account number with the biller'),
        }),
    }
);

const checkBalance = tool(
    () => {
        return JSON.stringify({
            balance: ACCOUNT.balance,
            currency: ACCOUNT.currency,
            as_of: new Date().toISOString(),
        });
    },
    {
        name: 'check_balance',
        description: 'Check the current account balance.',
        schema: z.object({}),
    }
);

const getTransactionHistory = tool(
    ({ limit }) => {
        const transactions = ACCOUNT.transactions.slice(-limit);
        return JSON.stringify({
            transactions,
            count: transactions.length,
        });
    },
    {
        name: 'get_transaction_history',
        description: 'Get recent transaction history.',
        schema: z.object({
            limit: z.number().describe('Maximum number of transactions to return'),
        }),
    }
);

// All tools
const tools = [makePayment, payBill, checkBalance, getTransactionHistory];

async function runAgentDemo(): Promise<void> {
    console.log(`\n${'='.repeat(70)}`);
    console.log('🤖 LANGCHAIN AGENT DEMO (TypeScript)');
    console.log('='.repeat(70));

    // Check for API key - langchain uses GOOGLE_API_KEY
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('\n❌ Error: GEMINI_API_KEY environment variable not set');
        console.log('   Set it with: export GEMINI_API_KEY="your-api-key"');
        process.exit(1);
    }
    // Set GOOGLE_API_KEY for langchain
    process.env.GOOGLE_API_KEY = apiKey;

    // Initialize Veto and wrap tools
    console.log('\n🛡️  Initializing Veto guardrails...');
    const veto = await Veto.init();
    const wrappedTools = veto.wrap(tools);
    console.log('   ✓ Veto initialized');

    // Create LangChain agent with Gemini using the new API
    console.log('\n🧠 Creating LangChain ReAct agent with Gemini...');
    const agent = createAgent({
        model: `google-genai:gemini-3-flash-preview`,
        tools: wrappedTools,
    });
    console.log('   ✓ Agent ready');


    // Test scenarios
    const testPrompts = [
        'Send 50 USD to friend@email.com',
        'Transfer 1500 USD to vendor@business.com',
        'Pay 2500 USD to anirudh@veto.ai',
        "What's my current balance?",
        'Pay my 600 USD insurance bill to Insurance Co, account POL-99999',
    ];

    console.log(`\n${'='.repeat(70)}`);
    console.log('🧪 RUNNING TEST SCENARIOS');
    console.log('='.repeat(70));

    for (let i = 0; i < testPrompts.length; i++) {
        const prompt = testPrompts[i];
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`📝 Scenario ${i + 1}: ${prompt}`);
        console.log('─'.repeat(70));

        try {
            const result = await agent.invoke({
                messages: [{ role: 'user', content: prompt }],
            });

            // Get the last message (agent's response)
            const lastMessage = result.messages[result.messages.length - 1];
            console.log(`\n🤖 Agent Response:`);
            console.log(`   ${lastMessage.content}`);

            // Log veto history
            console.log("\n🛡️  Veto History");
            console.log(veto.getHistoryStats());
        } catch (error) {
            console.log(`\n⚠️  Error: ${error}`);
        }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('🏁 Agent Demo Complete!');
    console.log('='.repeat(70));
    console.log(`\n📊 Final Account State:`);
    console.log(`   Balance: $${ACCOUNT.balance.toFixed(2)}`);
    console.log(`   Transactions: ${ACCOUNT.transactions.length}`);
}

runAgentDemo().catch(console.error);

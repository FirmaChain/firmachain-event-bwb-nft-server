import * as dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import { FirmaSDK } from '@firmachain/firma-js';

import StoreService from './services/store.service';

import { FIRMA_CONFIG } from './config';
import { logger } from './utils/logger';
import { getNowTime } from './utils/date';
import { getDecryptString } from './utils/crypto';

import { NFT_REWARD_QUEUE, NFT_REWARD_RESULT } from './constants/event';

const REDIS = process.env.REDIS!;
const REDIS_PASS = process.env.REDIS_PASS!;
const BOT_TOKEN = process.env.BOT_TOKEN!;
const CHAT_ID = process.env.CHAT_ID!;
const EXPLORER_HOST = process.env.EXPLORER_HOST!;
const MNEMONIC = process.env.MNEMONIC!;
const SECRET = process.env.SECRET!;

const telegrambot = new TelegramBot(BOT_TOKEN, { polling: false });

class EventScheduler {
  constructor(
    private storeService = new StoreService({ url: REDIS, password: REDIS_PASS }),
    private firmaSDK = new FirmaSDK(FIRMA_CONFIG)
  ) {
    this.start();
  }

  private start() {
    this.work();
  }

  private async work() {
    let rewardData = null;

    try {
      rewardData = await this.popReward();

      if (rewardData !== null) {
        const rewardJSON: { address: string; amount: string } = JSON.parse(rewardData);
        const address = rewardJSON.address;
        const amount = rewardJSON.amount;

        logger.info(`🚀[NFT_EVENT] SEND START ${address}`);

        const decryptMnemonic = getDecryptString(MNEMONIC, SECRET);
        const airdropWallet = await this.firmaSDK.Wallet.fromMnemonic(decryptMnemonic);
        const result = await this.firmaSDK.Bank.send(airdropWallet, address, Number(amount));

        if (result.code !== 0) {
          logger.info(`🚀[NFT_EVENT] !!!FAILED!!! ${address}`);
          logger.info(result);

          telegrambot.sendMessage(CHAT_ID, `[NFT_EVENT][FAILED] ${amount}FCT ${address} ${JSON.stringify(result)}`, {
            disable_web_page_preview: true,
          });
        } else {
          await this.writeResult(address, result.transactionHash);
          logger.info(`🚀[NFT_EVENT] ${address} : ${result.transactionHash}`);

          telegrambot.sendMessage(
            CHAT_ID,
            `[NFT_EVENT][SUCCESS] 2FCT ${address}\n${EXPLORER_HOST}/transactions/${result.transactionHash}`,
            {
              disable_web_page_preview: true,
            }
          );
        }

        logger.info(`🚀[NFT_EVENT] SEND END ${address}`);

        await this.work();
        return;
      } else {
        logger.info(`🚀[NFT_EVENT] NO ADDRESS`);
      }
    } catch (error) {
      logger.error(error);
    }

    setTimeout(async () => {
      await this.work();
    }, 3000);
  }

  private async popReward(): Promise<string | null> {
    return await this.storeService.pop(NFT_REWARD_QUEUE);
  }

  private async writeResult(address: string, transactionHash: string): Promise<void> {
    await this.storeService.zAdd(NFT_REWARD_RESULT, getNowTime(), JSON.stringify({ address, transactionHash }));
  }
}

new EventScheduler();

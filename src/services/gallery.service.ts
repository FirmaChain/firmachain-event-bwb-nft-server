import moment from 'moment';
import { v4 } from 'uuid';

import StoreService from './store.service';
import { ConnectService } from './connect.service';
import {
  RELAY,
  PROJECT_SECRET_KEY,
  NFT_REWARD_QUEUE,
  REQUEST_EXPIRE_SECOND,
  NFT_REQUEST_PREFIX,
  LOGIN_MESSAGE,
  STATION_IDENTITY,
  NFT_GALLERY,
  NFT_GALLERY_FEATURED,
  NFT_GALLERY_REWARD_ADDRESS,
} from '../constants/event';

class GalleryService {
  constructor(public storeService: StoreService, private connectService: ConnectService = new ConnectService(RELAY)) {}

  public async getStatus(requestKey: string): Promise<{
    message: string;
    type: string;
    status: number;
    signer: string;
    signData: string;
    extra: string;
    addedAt: string;
  }> {
    try {
      const requestData = await this.getRequest(requestKey);

      return requestData;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async arbitarySignForLogin(): Promise<{ requestKey: string; qrcode: string }> {
    try {
      const message: string = v4();
      const info: string = LOGIN_MESSAGE;

      const session = await this.connectService.connect(PROJECT_SECRET_KEY);
      const qrcodeOrigin = await this.connectService.getQRCodeForArbitarySign(session, message, info);
      const requestKey = qrcodeOrigin.replace('sign://', '');
      const qrcode = qrcodeOrigin.replace('sign://', `${STATION_IDENTITY}://`);

      await this.addRequest('LOGIN', requestKey, message);

      return {
        requestKey,
        qrcode,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async submitGallery(signer: string, nftId: string, code: string): Promise<void> {
    try {
      const typeCode = code[0];
      let rewardAmount = '';

      switch (typeCode) {
        case '1':
          await this.addGallery(nftId, signer);
          await this.addGalleryFeatured(nftId, signer);

          rewardAmount = this.getRandomRewardAmount(37, 42);
          break;
        case '3':
          break;
        case '2':
        default:
          await this.addGallery(nftId, signer);

          rewardAmount = this.getRandomRewardAmount(32, 36);
          break;
      }

      if ((await this.isGalleryRewardable(signer)) === true) {
        await this.addGalleryRewardAddress(signer);
        await this.addGalleryQueue(signer, rewardAmount);
      }
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async isDuplicateGallery(address: string): Promise<{ isRewardable: boolean }> {
    try {
      const isRewardable = await this.isGalleryRewardable(address);

      return {
        isRewardable,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async getNftLatest(): Promise<{
    nftList: {
      nftId: string;
      timestamp: string;
    }[];
  }> {
    try {
      const nftOriginList = await this.getGalleryLatest();

      let nftList: { nftId: string; timestamp: string }[] = [];

      for (let nft of nftOriginList) {
        const nftJSON = JSON.parse(nft.value);
        nftList.push({ nftId: nftJSON.nftId, timestamp: moment(nftJSON.timestamp).utc().toISOString() });
      }

      return {
        nftList,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async getNftLatestFeatured(): Promise<{
    nftList: {
      nftId: string;
      timestamp: string;
    }[];
  }> {
    try {
      const nftOriginList = await this.getGalleryFeaturedLatest();

      let nftList: { nftId: string; timestamp: string }[] = [];

      for (let nft of nftOriginList) {
        const nftJSON = JSON.parse(nft.value);
        nftList.push({ nftId: nftJSON.nftId, timestamp: moment(nftJSON.timestamp).utc().toISOString() });
      }

      return {
        nftList,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  private async addRequest(type: string, requestKey: string, message: string, signer = '', extra = ''): Promise<void> {
    const addedAt = moment.utc().format('YYYY-MM-DD HH:mm:ss');

    await this.storeService.hsetMessage(`${NFT_REQUEST_PREFIX}${requestKey}`, 'type', type);
    await this.storeService.hsetMessage(`${NFT_REQUEST_PREFIX}${requestKey}`, 'message', message);
    await this.storeService.hsetMessage(`${NFT_REQUEST_PREFIX}${requestKey}`, 'status', 0);
    await this.storeService.hsetMessage(`${NFT_REQUEST_PREFIX}${requestKey}`, 'signer', signer);
    await this.storeService.hsetMessage(`${NFT_REQUEST_PREFIX}${requestKey}`, 'signData', '');
    await this.storeService.hsetMessage(`${NFT_REQUEST_PREFIX}${requestKey}`, 'extra', extra);
    await this.storeService.hsetMessage(`${NFT_REQUEST_PREFIX}${requestKey}`, 'addedAt', addedAt);

    await this.storeService.expireKey(`${NFT_REQUEST_PREFIX}${requestKey}`, Number(REQUEST_EXPIRE_SECOND));
  }

  private async getRequest(requestKey: string): Promise<{
    message: string;
    type: string;
    status: number;
    signer: string;
    signData: string;
    extra: string;
    addedAt: string;
  }> {
    const result = await this.storeService.hgetAll(`${NFT_REQUEST_PREFIX}${requestKey}`);
    if (result.status) result.status = Number(result.status);
    else result.status = -1;

    return result;
  }

  private async addGallery(nftId: string, address: string) {
    const now = new Date().getTime();
    await this.storeService.zAdd(NFT_GALLERY, now, JSON.stringify({ nftId, address, timestamp: now }));
  }

  private async getGalleryLatest(): Promise<{ value: string; score: number }[]> {
    return await this.storeService.zTopTen(NFT_GALLERY);
  }

  private async addGalleryFeatured(nftId: string, address: string) {
    const now = new Date().getTime();
    await this.storeService.zAdd(NFT_GALLERY_FEATURED, now, JSON.stringify({ nftId, address, timestamp: now }));
  }

  private async getGalleryFeaturedLatest(): Promise<{ value: string; score: number }[]> {
    return await this.storeService.zTopTen(NFT_GALLERY_FEATURED);
  }

  private async addGalleryRewardAddress(address: string) {
    await this.storeService.hsetMessage(NFT_GALLERY_REWARD_ADDRESS, address, 1);
  }

  private async isGalleryRewardable(address: string): Promise<boolean> {
    const data = await this.storeService.hget(NFT_GALLERY_REWARD_ADDRESS, address);
    return data === null;
  }

  private async addGalleryQueue(address: string, amount: string) {
    await this.storeService.push(NFT_REWARD_QUEUE, JSON.stringify({ address, amount }));
  }

  private getRandomRewardAmount(min: number, max: number): string {
    return (Math.random() * (max - min) + min).toFixed(6);
  }
}

export default GalleryService;

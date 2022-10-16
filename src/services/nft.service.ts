import moment from 'moment';
import { v4 } from 'uuid';
import { EncodeObject } from '@cosmjs/proto-signing';
import { NftTxClient } from '@firmachain/firma-js';

import StoreService from './store.service';
import { ConnectService } from './connect.service';
import {
  SUCCESS,
  INVALID,
  RELAY,
  PROJECT_SECRET_KEY,
  REQUEST_EXPIRE_SECOND,
  NFT_REQUEST,
  ADDRESSBOOK,
  LOGIN_MESSAGE,
  MINT_MESSAGE,
  STATION_IDENTITY,
  NFT_REWARD_QUEUE,
} from '../constants/event';

class NftService {
  constructor(public storeService: StoreService, private connectService: ConnectService = new ConnectService(RELAY)) {}

  public async getStatus(
    requestKey: string
  ): Promise<{ message: string; status: number; signer: string; addedAt: string }> {
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

  public async directSignForMint(
    signer: string,
    nftImageFile: any,
    nftName: string,
    nftDescription: string
  ): Promise<{ requestKey: string; qrcode: string }> {
    try {
      const dappNftId = v4();
      const tokenURI = await this.connectService.getGenerateTokenURI(nftImageFile, nftName, nftDescription, dappNftId);
      const NFTData = { nftId: '', dappNftId, name: nftName, description: nftDescription, attributes: [] };

      //TODO : NFT DATA SAVE

      const message = this.createNftMintMessage(signer, tokenURI);
      const info: string = MINT_MESSAGE;
      const pubkey = await this.getPubkey(signer);

      const session = await this.connectService.connect(PROJECT_SECRET_KEY);
      const signDoc = await this.connectService.getSignDoc(signer, pubkey, message);
      const qrcodeOrigin = await this.connectService.getQRCodeForDirectSign(session, signer, signDoc, info, {});
      const requestKey = qrcodeOrigin.replace('sign://', '');
      const qrcode = qrcodeOrigin.replace('sign://', `${STATION_IDENTITY}://`);

      await this.addRequest('MINT', requestKey, signDoc, signer);

      return {
        requestKey,
        qrcode,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async callback(requestKey: string, approve: boolean, signData: any): Promise<void> {
    const requestData = await this.getRequest(requestKey);

    if (approve === false) {
      await this.changeRequestStatus(requestKey, INVALID);
      return;
    }

    try {
      switch (requestData.type) {
        case 'LOGIN':
          await this.callbackLogin(signData, requestKey, requestData.message);
          break;
        case 'MINT':
          await this.callbackMint(requestKey, signData, requestData.signer);
          break;
      }
    } catch (error) {
      console.log(error);
    }
  }

  private async callbackLogin(signData: any, requestKey: string, originMessage: string) {
    const signRawData = signData.rawData;

    if (await this.connectService.verifyArbitary(signRawData, originMessage)) {
      const signer = signData.address;
      const pubkey = this.connectService.getSingerPubkeyFromSignRaw(signRawData);

      await this.changeRequestStatus(requestKey, SUCCESS);
      await this.changeRequestSigner(requestKey, signer);

      if ((await this.isDuplicateAddress(signer)) === false) {
        await this.addAddress(signer, pubkey);
      }
    } else {
      await this.changeRequestStatus(requestKey, INVALID);
    }
  }

  private async callbackMint(requestKey: string, signData: any, signer: string) {
    console.log(JSON.stringify(signData));

    //TODO : NFT DATA SAVE

    await this.changeRequestStatus(requestKey, SUCCESS);
    await this.changeRequestSignData(requestKey, signData);

    await this.addNftQueue(signer, JSON.stringify(signData));
  }

  public async verify(
    requestKey: string,
    signature: string
  ): Promise<{ requestKey: string; signature: string; isValid: boolean }> {
    const requestData = await this.getRequest(requestKey);
    const signDoc = this.connectService.parseSignDocValues(requestData.message);
    const address = requestData.signer;

    const isValid = await this.connectService.verifyDirectSignature(address, signature, signDoc);

    return {
      requestKey,
      signature,
      isValid,
    };
  }

  private createNftMintMessage(address: string, tokenURI: string): Array<EncodeObject> {
    const msgNftMint = NftTxClient.msgMint({
      owner: address,
      tokenURI,
    });

    return [msgNftMint];
  }

  private async addRequest(type: string, requestKey: string, message: string, signer = '', extra = ''): Promise<void> {
    const addedAt = moment.utc().format('YYYY-MM-DD HH:mm:ss');

    await this.storeService.hsetMessage(`${NFT_REQUEST}${requestKey}`, 'type', type);
    await this.storeService.hsetMessage(`${NFT_REQUEST}${requestKey}`, 'message', message);
    await this.storeService.hsetMessage(`${NFT_REQUEST}${requestKey}`, 'status', 0);
    await this.storeService.hsetMessage(`${NFT_REQUEST}${requestKey}`, 'signer', signer);
    await this.storeService.hsetMessage(`${NFT_REQUEST}${requestKey}`, 'signData', '');
    await this.storeService.hsetMessage(`${NFT_REQUEST}${requestKey}`, 'extra', extra);
    await this.storeService.hsetMessage(`${NFT_REQUEST}${requestKey}`, 'addedAt', addedAt);

    await this.storeService.expireKey(`${NFT_REQUEST}${requestKey}`, Number(REQUEST_EXPIRE_SECOND));
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
    const result = await this.storeService.hgetAll(`${NFT_REQUEST}${requestKey}`);
    if (result.status) result.status = Number(result.status);
    else result.status = -1;

    return result;
  }

  private async changeRequestStatus(requestKey: string, status: number): Promise<void> {
    await this.storeService.hsetMessage(`${NFT_REQUEST}${requestKey}`, 'status', status);
  }

  private async changeRequestSigner(requestKey: string, signer: string): Promise<void> {
    await this.storeService.hsetMessage(`${NFT_REQUEST}${requestKey}`, 'signer', signer);
  }

  private async changeRequestSignData(requestKey: string, signData: any): Promise<void> {
    await this.storeService.hsetMessage(`${NFT_REQUEST}${requestKey}`, 'signData', JSON.stringify(signData));
  }

  private async addNftQueue(address: string, signData: string) {
    await this.storeService.push(NFT_REWARD_QUEUE, JSON.stringify({ address, signData }));
  }

  private async addAddress(address: string, pubkey: string): Promise<void> {
    await this.storeService.hsetMessage(ADDRESSBOOK, address, pubkey);
  }

  private async getPubkey(address: string): Promise<string> {
    return await this.storeService.hget(ADDRESSBOOK, address);
  }

  private async isDuplicateAddress(address: string): Promise<boolean> {
    const pubkey = await this.storeService.hget(ADDRESSBOOK, address);
    return pubkey !== null;
  }
}

export default NftService;

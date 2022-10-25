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
  NFT_REQUEST_PREFIX,
  ADDRESSBOOK,
  LOGIN_MESSAGE,
  MINT_MESSAGE,
  STATION_IDENTITY,
  AIRDROP_AMOUNT,
  NFT_MINT_REWARD_ADDRESS,
  NFT_REWARD_QUEUE,
  NFT_DATA,
  COLLECTION_NAME,
} from '../constants/event';

class NftService {
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

  public async getNft(dappNftId: string): Promise<{
    nftId: string;
    dappNftId: string;
    name: string;
    description: string;
    collection: string;
    createdBy: string;
    attributes: { type: string; key: string; description: string; value: string }[];
  }> {
    try {
      const nftData = await this.getNftByDappNftId(dappNftId);
      const nftDataJSON = JSON.parse(nftData);

      nftDataJSON.collection = COLLECTION_NAME;

      return nftDataJSON;
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
      const NFTData = {
        nftId: '',
        dappNftId,
        name: nftName,
        description: nftDescription,
        createdBy: signer,
        collection: COLLECTION_NAME,
        hash: '',
        attributes: [{ type: 'string', key: 'Keyword', description: 'BWB 2022 NFT', value: 'BWB 2022' }],
      };

      await this.setNftByDappNftId(dappNftId, NFTData);

      const message = this.createNftMintMessage(signer, tokenURI);
      const info: string = MINT_MESSAGE;
      const pubkey = await this.getPubkey(signer);

      const session = await this.connectService.connect(PROJECT_SECRET_KEY);
      const signDoc = await this.connectService.getSignDoc(signer, pubkey, message);
      const qrcodeOrigin = await this.connectService.getQRCodeForDirectSign(session, signer, signDoc, info, {});
      const requestKey = qrcodeOrigin.replace('sign://', '');
      const qrcode = qrcodeOrigin.replace('sign://', `${STATION_IDENTITY}://`);

      await this.addRequest('MINT', requestKey, signDoc, signer, dappNftId);

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
          await this.callbackMint(requestKey, signData, requestData.signer, requestData.extra);
          break;
      }
    } catch (error) {
      console.log(error);
    }
  }

  private async callbackLogin(signData: any, requestKey: string, originMessage: string) {
    const signRawData = signData.rawData;
    const pubkey = this.connectService.getSingerPubkeyFromSignRaw(signRawData);

    if (await this.connectService.verifyArbitary(signRawData, originMessage)) {
      const signer = signData.address;

      await this.changeRequestSigner(requestKey, signer);
      await this.changeRequestStatus(requestKey, SUCCESS);

      if ((await this.isDuplicateAddress(signer)) === false) {
        await this.addAddress(signer, pubkey);
      }
    } else {
      await this.changeRequestStatus(requestKey, INVALID);
    }
  }

  private async callbackMint(requestKey: string, signData: any, signer: string, extra: string) {
    const rawDataJSON = JSON.parse(signData.rawData);
    const rawLogJSON = JSON.parse(rawDataJSON.rawLog);
    const transactionHash = rawLogJSON.transactionHash;
    const nftId = rawLogJSON[0].events[0].attributes[2].value;
    const nftData = await this.getNftByDappNftId(extra);

    const nftDataJSON = JSON.parse(nftData);
    nftDataJSON.nftId = nftId;
    nftDataJSON.hash = transactionHash;

    await this.setNftByDappNftId(extra, nftDataJSON);

    await this.changeRequestSignData(requestKey, signData);
    await this.changeRequestStatus(requestKey, SUCCESS);

    if ((await this.isMintRewardable(signer)) === true) {
      await this.addNftQueue(signer);
      await this.addMintRewardAddress(signer);
    }
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

  private async changeRequestStatus(requestKey: string, status: number): Promise<void> {
    await this.storeService.hsetMessage(`${NFT_REQUEST_PREFIX}${requestKey}`, 'status', status);
  }

  private async changeRequestSigner(requestKey: string, signer: string): Promise<void> {
    await this.storeService.hsetMessage(`${NFT_REQUEST_PREFIX}${requestKey}`, 'signer', signer);
  }

  private async changeRequestSignData(requestKey: string, signData: any): Promise<void> {
    await this.storeService.hsetMessage(`${NFT_REQUEST_PREFIX}${requestKey}`, 'signData', JSON.stringify(signData));
  }

  private async addNftQueue(address: string) {
    await this.storeService.push(NFT_REWARD_QUEUE, JSON.stringify({ address, amount: AIRDROP_AMOUNT }));
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

  private async addMintRewardAddress(address: string): Promise<void> {
    await this.storeService.hsetMessage(NFT_MINT_REWARD_ADDRESS, address, 1);
  }

  private async isMintRewardable(address: string): Promise<boolean> {
    const data = await this.storeService.hget(NFT_MINT_REWARD_ADDRESS, address);
    return data === null;
  }

  private async getNftByDappNftId(dappNftId: string) {
    return await this.storeService.hget(NFT_DATA, dappNftId);
  }

  private async setNftByDappNftId(
    dappNftId: string,
    nftData: {
      nftId: string;
      dappNftId: string;
      name: string;
      description: string;
      createdBy: string;
      hash: string;
      attributes: { type: string; key: string; description: string; value: string }[];
    }
  ) {
    this.storeService.hsetMessage(NFT_DATA, dappNftId, JSON.stringify(nftData));
  }
}

export default NftService;

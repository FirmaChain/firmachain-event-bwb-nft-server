import axios, { AxiosInstance } from 'axios';

import { FirmaSDK, FirmaUtil } from '@firmachain/firma-js';
import { EncodeObject } from '@cosmjs/proto-signing';
import { FIRMA_CONFIG } from '../config';
import { API_HOST, PROJECT_ID } from '../constants/event';

export interface UserSession {
  projectKey: string;
}

interface ResponseAuthData {
  projectKey: string;
}

interface ResponseQRCodeData {
  data: string;
}

export class ConnectService {
  constructor(
    public relay: string,
    private requestService = new RequestService(relay),
    private firmaSDK = new FirmaSDK(FIRMA_CONFIG)
  ) {}

  public async connect(projectSecretKey: string): Promise<UserSession> {
    try {
      const response: ResponseAuthData = await this.requestService.requestPost<ResponseAuthData>('/v1/projects/auth', {
        projectSecretKey,
      });

      return {
        projectKey: response.projectKey,
      };
    } catch (error) {
      console.log(error);
      throw new Error('Failed Request');
    }
  }

  public async getQRCodeForArbitarySign(
    session: UserSession,
    message: string,
    info: string,
    signer = ''
  ): Promise<string> {
    try {
      const response: ResponseQRCodeData = await this.requestService.requestPost<ResponseQRCodeData>(
        `/v1/projects/sign`,
        { qrType: 0, type: 0, signer, message, info, argument: {}, isMultiple: false },
        { authorization: `Bearer ${session.projectKey}` }
      );

      const QRCode = response.data;

      return QRCode;
    } catch (error) {
      console.log(error);
      throw new Error('Invalid Request');
    }
  }

  public async getQRCodeForDirectSign(
    session: UserSession,
    signer: string,
    message: string,
    info: string,
    argument: object
  ): Promise<string> {
    try {
      const response: ResponseQRCodeData = await this.requestService.requestPost<ResponseQRCodeData>(
        `/v1/projects/sign`,
        { qrType: 0, type: 1, signer, message, info, argument, isMultiple: false },
        { authorization: `Bearer ${session.projectKey}` }
      );

      const QRCode = response.data;

      return QRCode;
    } catch (error) {
      console.log(error);
      throw new Error('Invalid Request');
    }
  }

  public async getSignDoc(signer: string, pubkey: string, message: readonly EncodeObject[]) {
    return await FirmaUtil.makeSignDocWithStringify(signer, pubkey, message, {});
  }

  public parseSignDocValues(signDoc: string): Promise<any> {
    return FirmaUtil.parseSignDocValues(signDoc);
  }

  public async verifyDirectSignature(address: string, signature: string, signDoc: any): Promise<boolean> {
    return await FirmaUtil.verifyDirectSignature(address, signature, signDoc);
  }

  public getSingerPubkeyFromSignRaw(rawData: string) {
    try {
      const rawJSON = JSON.parse(rawData);
      return rawJSON.pubkey;
    } catch (error) {}
  }

  public async verifyArbitary(data: string, message: string) {
    return FirmaUtil.experimentalAdr36Verify(JSON.parse(data), message);
  }

  public getUFCTStringFromFCT(fct: number) {
    return FirmaUtil.getUFCTStringFromFCT(fct);
  }

  public getUFCTFromFCT(fct: number) {
    return FirmaUtil.getUFCTFromFCT(fct);
  }

  public async getGenerateTokenURI(nftImage: string, nftName: string, nftDescription: string, dappNftId: string) {
    const imageBuffer = Buffer.from(nftImage.replace('data:image/jpeg;base64,', ''), 'base64');
    const ipfsImageHash = await this.firmaSDK.Ipfs.addBuffer(imageBuffer);
    const imageURI = this.firmaSDK.Ipfs.getURLFromHash(ipfsImageHash);

    const nftData = {
      name: nftName,
      description: nftDescription,
      identity: PROJECT_ID,
      imageURI,
      metaURI: `${API_HOST}/nft/${dappNftId}`,
    };

    const tokenURIHash = await this.firmaSDK.Ipfs.addJson(JSON.stringify(nftData));
    const tokenURI = this.firmaSDK.Ipfs.getURLFromHash(tokenURIHash);

    return tokenURI;
  }
}

class RequestService {
  constructor(
    public realy: string,
    private instance: AxiosInstance = axios.create({
      baseURL: realy,
      timeout: 5000,
    })
  ) {}

  async requestPost<T = any>(uri: string, body: any = {}, headers: any = {}): Promise<T> {
    try {
      const response = await this.instance.post(uri, body, { headers });
      if (response.data.code === 0) {
        return response.data.result;
      } else {
        throw new Error(response.data.message);
      }
    } catch (e) {
      throw e;
    }
  }
}

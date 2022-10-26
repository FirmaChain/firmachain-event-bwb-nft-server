import { Request, Response } from 'express';

import StoreService from '../services/store.service';
import NftService from '../services/nft.service';

import { resultLog } from '../utils/logger';
import { SUCCESS, INVALID_KEY } from '../constants/httpResult';

class NftController {
  constructor(public storeService: StoreService, private nftService = new NftService(storeService)) {}

  public getNftAll = (req: Request, res: Response): void => {
    this.nftService
      .getNftAll()
      .then((result) => {
        res.send(result);
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public getStatus = (req: Request, res: Response): void => {
    const { requestKey } = req.params;

    this.nftService
      .getStatus(requestKey)
      .then((result) => {
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public getNft = (req: Request, res: Response): void => {
    const { dappNftId } = req.params;

    this.nftService
      .getNft(dappNftId)
      .then((result) => {
        res.send(result);
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public arbitarySignForLogin = (req: Request, res: Response): void => {
    this.nftService
      .arbitarySignForLogin()
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public directSignForMint = (req: Request, res: Response): void => {
    const { signer, nftImage, nftName, nftDescription } = req.body;

    this.nftService
      .directSignForMint(signer, nftImage, nftName, nftDescription)
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public callback = (req: Request, res: Response): void => {
    const { requestKey, approve, signData } = req.body;

    this.nftService
      .callback(requestKey, approve, signData)
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public verify = (req: Request, res: Response): void => {
    const { requestKey, signature } = req.body;

    this.nftService
      .verify(requestKey, signature)
      .then((result) => {
        resultLog(result);
        res.send(result);
      })
      .catch(() => {
        res.send({ requestKey, signature, isValid: false });
      });
  };
}

export default NftController;

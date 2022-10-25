import { Request, Response } from 'express';

import StoreService from '../services/store.service';
import GalleryService from '../services/gallery.service';

import { resultLog } from '../utils/logger';
import { SUCCESS, INVALID_KEY } from '../constants/httpResult';

class GalleryController {
  constructor(public storeService: StoreService, private galleryService = new GalleryService(storeService)) {}

  public getStatus = (req: Request, res: Response): void => {
    const { requestKey } = req.params;

    this.galleryService
      .getStatus(requestKey)
      .then((result) => {
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public arbitarySignForLogin = (req: Request, res: Response): void => {
    this.galleryService
      .arbitarySignForLogin()
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public submitGallery = (req: Request, res: Response): void => {
    const { signer, nftId, code } = req.body;

    this.galleryService
      .submitGallery(signer, nftId, code)
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public isDuplicateGallery = (req: Request, res: Response): void => {
    const { address } = req.params;

    this.galleryService
      .isDuplicateGallery(address)
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public getNftLatest = (req: Request, res: Response): void => {
    this.galleryService
      .getNftLatest()
      .then((result) => {
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public getNftLatestFeatured = (req: Request, res: Response): void => {
    this.galleryService
      .getNftLatestFeatured()
      .then((result) => {
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };
}

export default GalleryController;

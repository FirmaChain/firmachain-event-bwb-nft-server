import { Router } from 'express';
import { Routes } from '../interfaces/routes.interface';

import StoreService from '../services/store.service';
import NftController from '../controllers/nft.controller';

class NftRoute implements Routes {
  constructor(
    public storeService: StoreService,
    public path = '/nft',
    public router = Router(),
    private nftController = new NftController(storeService)
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/requests/:requestKey`, this.nftController.getStatus);
    this.router.get(`${this.path}/:dappNftId`, this.nftController.getNft);

    this.router.post(`${this.path}/sign/login`, this.nftController.arbitarySignForLogin);
    this.router.post(`${this.path}/sign/mint`, this.nftController.directSignForMint);

    this.router.post(`${this.path}/callback`, this.nftController.callback);
    this.router.post(`${this.path}/verify`, this.nftController.verify);
  }
}

export default NftRoute;

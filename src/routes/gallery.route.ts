import { Router } from 'express';
import { Routes } from '../interfaces/routes.interface';

import StoreService from '../services/store.service';
import GalleryController from '../controllers/gallery.controller';

class GalleryRoute implements Routes {
  constructor(
    public storeService: StoreService,
    public path = '/gallery',
    public router = Router(),
    private galleryController = new GalleryController(storeService)
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/requests/:requestKey`, this.galleryController.getStatus);

    this.router.post(`${this.path}/sign/login`, this.galleryController.arbitarySignForLogin);

    this.router.get(`${this.path}/latest`, this.galleryController.getNftLatest);
    this.router.get(`${this.path}/latest/featured`, this.galleryController.getNftLatestFeatured);

    this.router.post(`${this.path}`, this.galleryController.submitGallery);
    this.router.get(`${this.path}/:address`, this.galleryController.isDuplicateGallery);
  }
}

export default GalleryRoute;

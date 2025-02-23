import type { Request as ExpressRequest } from "express";

export interface CustomRequest extends ExpressRequest {
    file?: Express.Multer.File;
}

import bcrypt from "bcrypt";
import User from "../models/Users.mongo";
import asyncHandler from "../middlewares/tryCatch";
import { CustomError } from "../middlewares/errors/CustomError";
import { AWS_BUCKET_NAME, PROFILE_URL } from "../helpers/envConfig";
import { NextFunction, Request, Response } from "express";
import { checkUserExists, getMediasUrls, getProfileImage, getUniqueMediaName } from "../helpers/utils";
import { uploadToS3 } from "../helpers/s3";

const generateUsername = (fullName: string) => {
  if (!fullName) {
    throw new Error('Full name is required');
  }

  let username = fullName.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
  const randomNum = Math.floor(Math.random() * 100);
  username += randomNum;
  return username;
};

export const registerUser = asyncHandler(
  async (req: Request, res: Response) => {

    const { fullName, userName, email, password } = req.body;

    if (!fullName || !userName || !email || !password) {
      throw new CustomError("All fields are required", 400);
    }

    if (!req.file) {
      throw new CustomError("Profile image is required", 400);
    }

    await checkUserExists(email, userName);

    const hashedPassword = await bcrypt.hash(password, 10);

    const profileImage = getUniqueMediaName(req.file.originalname);

    const user = new User({
      fullName,
      userName,
      email,
      password: hashedPassword,
      profileImage
    });

    await Promise.all([
      uploadToS3(AWS_BUCKET_NAME, profileImage, req.file.buffer, req.file.mimetype),
      user.save()
    ])

    const userResponse = {
      id: user._id,
      fullName: user.fullName,
      userName: user.userName,
      email: user.email,
      profileImage: getMediasUrls(PROFILE_URL, user.profileImage),
    };

    res.status(201).json({ success: true, message: "User registered successfully", user: userResponse });
  }
);

export const loginUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) throw new CustomError("User not found", 401);

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) throw new CustomError("Incorrect password", 401);

    const data = {
      id: user._id as string,
      fullName: user.fullName,
      userName: user.userName,
      email: user.email,
      profileImage: getProfileImage(
        user.isGoogleUser,
        PROFILE_URL,
        user.profileImage
      ),
    };

    res.status(200).json({ user: data, success: true });
  }
);

export const googleLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, fullName, image } = req.body;
  if (!email) {
    throw new CustomError("Email is required", 400);
  }
  const user = await User.findOne({ email });

  if (user) {
    const data = {
      id: user._id as string,
      userName: user.userName,
      fullName: user.fullName,
      profileImage: getProfileImage(
        user.isGoogleUser,
        PROFILE_URL,
        user.profileImage
      ),
      email: user.email,
    };
   
    res.status(200).json({ succcess: true, user: data });
  } else {
    const userName = generateUsername(fullName);

    const newUser = new User({
      email,
      fullName,
      profileImage: image,
      userName,
      isGoogleUser: true
    });
    await newUser.save();
    const data = {
      id: newUser._id as string,
      userName: newUser.userName,
      fullName: newUser.fullName,
      profileImage: image,
      email: newUser.email,
    };
   
    res.status(200).json({ user: data, success: true });
  }
});

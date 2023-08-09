require('dotenv').config();
const multer = require('multer');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const User = require('./model/User');

const storage = multer.memoryStorage();
const upload = multer({ storage });

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static('public'));


app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24,
    }
}));

//database
const connectDB = async ()=>{
    try{
        mongoose.set('strictQuery', false);
        const conn = await mongoose.connect(process.env.DATABASE_URI)
        console.log(`database connected: ${conn.connection.host}`)
    }catch (err){
        console.log(err);
    }
}

connectDB();


app.get('/', async (req, res) => {
    
    try {
        const users = await User.find();
        const loggedInUser = await req.session.user;

        res.render('home', { users,loggedInUser });
    } catch (err) {
        console.error('유저 정보 가져오기 오류:', err);
        res.status(500).send('유저 정보를 가져오는데 오류가 생겼습니다.');    
    }
});

app.get('/signup', (req, res) => {
    res.render('signup');
})

app.post('/signup',  upload.single("profileImage"), async (req, res) => {
    const { username, password, birthdate } = req.body;
    try {
        const existingUser = await User.findOne( {username});
        if (existingUser) {
            return res.render('signup', {errorMessage: "이미 사용중인 아이디입니다."})
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        

        const newUser = new User({
            username,
            password: hashedPassword,
            birthdate: new Date(birthdate),
            profileImage: {
                data: req.file.buffer,
                contentType: req.file.mimetype,
            },
        });
        await newUser.save();
        
        
        return res.render('signup', {successMessage: '회원가입이 완료되었습니다!'})
    } catch (err) {
        console.error('회원가입 오류:', err);
        return res.render('signup', { errorMessage: '회원가입 중 오류가 발생했습니다.'})

    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).render('login', {errorMessage:'사용자를 찾을 수 없습니다.' });
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).render('login', {errorMessage:'비밀번호가 일치하지 않습니다.' })
        }
        const loggedInUser = {
            id: user._id,
            username: user.username,
            birthdate: new Date(user.birthdate),
        }
        
        req.session.user = loggedInUser;

        res.redirect(`/profile/${user._id}`);
    } catch (err) {
        console.error('로그인 오류:', err);
        res.redirect('/login');

    }
});

app.get('/profile', (req, res) => {
    const loggedInUser = req.session.user;
    
    if (!req.session.user) {
        return res.redirect('/login');
    }
   

    res.render('profile',{ user: loggedInUser})
})

app.post('/logout', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    
    req.session.destroy((err) => {
        if (err) {
            console.error("세션 제거 오류:", err);
            return res.status(500).send('로그아웃에 문제 발생');
        }
        res.redirect('/');
    })
})

app.get('/profile-image/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user || !user.profileImage) {
            return res.status(404).send('이미지를 찾을 수 없습니다.');
        }

        res.set('Content-Type', user.profileImage.contentType);
        res.send(user.profileImage.data);
    } catch (error) {
        console.error('이미지 불러오기 오류:', error);
        res.status(500).send('이미지 불러오기에 오류가 발생했습니다.');
    }
});


app.get('/profile/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);

        if (!user) {
            return res.status(404).send('유저를 찾을 수 없습니다.');
        }
        const loggedInUser = req.session.user;
       /*  console.log(user)
        console.log(loggedInUser);
 */
        // 로그인된 유저와 프로필 페이지의 유저를 비교하여 같으면 true, 다르면 false
        const isSameUser = loggedInUser && user._id.toString() === loggedInUser.id.toString();
        
        
        res.render('profile', { user,loggedInUser, isSameUser });
    } catch (err) {
        console.error('프로필 페이지 오류:', err);
        return res.status(500).send('프로필 페이지 로등 중 오류가 발생했습니다.');
    }
});



app.get('/edit-profile', async (req, res) => {
    try {
        const loggedInUser = req.session.user;
        if (!loggedInUser) {
            return res.redirect('/login');
        }
        const user = await User.findById(loggedInUser.id);
        
        res.render('edit-profile', { user });
    } catch (err) {
        console.error('프로필 수정 페이지오류:', err);
        res.status(500).send('프로필 수정 중 오류 발생');
    }
});

app.post('/update-profile', async (req, res) => {
    try {
        const loggedInUser = req.session.user;
        if (!loggedInUser) {
            return res.redirect('/login');
        }

        const { username, birthdate } = req.body;
        const user = await User.findById(loggedInUser.id);
        

        user.username = username;
        user.birthdate = birthdate;

        await user.save();

        return res.redirect('/profile/' + loggedInUser.id);
    } catch (err) {
        console.error('프로필 수정 오류:', err);
        return res.status(500).send('프로필 수정 중 오류 발생');
    }
});

app.get('/cgv', (req, res) => {
    res.render('cgv');
});


app.listen(process.env.PORT, () => {
    console.log(`server is running on ${process.env.PORT}`)
})

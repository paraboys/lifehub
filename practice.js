// function hello(){
//     console.log("Hello World");
// }
// function print(hello1){
//     hello1();
// }
// print(()=>{console.log("Hello World")});


// call back function 

// const hello=()=>{
//     console.log("Hello World");
// }
// const print=(helloFunc)=>{
//     helloFunc();
// }
// print(hello);



// callback hell

// function getdata(dataid, getnextdata){
//     setTimeout(() => {
//         console.log(dataid);
//         if(getnextdata){
//             getnextdata();
//         }
//     }, 1000);
// }
// getdata(1, ()=>{getdata(2, ()=>{getdata(3)})});




// promises in javascript

// function getdata(dataid, getnextdata){
//     return new Promise((res,rej)=>{ 
//         setTimeout(() => {
//         console.log(dataid);
//         res("success");
//         // console.log(Promise)
//         if(getnextdata){
//             getnextdata();
//         }
//     }, 1000);})
   
// }
// getdata(1, ()=>{getdata(2, ()=>{getdata(3)})});



// const getdata =()=>{
// return new Promise((res,rej)=>{
//     setTimeout(() => {
//         console.log("i am a promise");
//         res("success");
//     }, 1000);   
// })}

// let data = getdata();
// data.then((res)=>{
//  console.log(res);
// })


const fn =() => new Promise((res,rej)=>{
   const resu= {
    "name":"paras",
    "age":22
   }
   const st=200;
   if(st==200){
   res(resu);
   }
   else rej("error");
}  )


const retry = (fn, retries=3, delay=1000) => {
 return new Promise ((res, rej)=>{
    const attempt = () => {
        fn()
        .then(res)
        .catch((err)=>{
            if(retries === 0){
                rej(err);
            }
            else{
                retries--;
                setTimeout(attempt, delay);
            }
        })
    }
    attempt();


 })
};

retry(fn, 3, 1000).then((res)=>{
    console.log(res);
}).catch((err)=>{
    console.log(err);
})
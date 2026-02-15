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



const getdata =()=>{
return new Promise((res,rej)=>{
    setTimeout(() => {
        console.log("i am a promise");
        res("success");
    }, 1000);   
})}

let data = getdata();
data.then((res)=>{
 console.log(res);
})



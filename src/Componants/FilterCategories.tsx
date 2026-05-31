import {useQuery} from "@tanstack/react-query";
import {get_categories} from "../api/Category.ts";
import {Dispatch, SetStateAction, useState} from "react";

type FilterCategoriesProps = {
    isOpen: boolean;
    setIsOpen: Dispatch<SetStateAction<boolean>>;
};
export default function FilterCategories({isOpen, setIsOpen}: FilterCategoriesProps) {
    const {data: categories = []} = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
    });

    return (
        <div>
            {categories?.map((cat) => (<div key={cat.id}>{cat.name}</div>))}

        </div>
    )
}
